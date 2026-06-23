//! Transport Tor : services onion pour joindre des pairs n'importe où.
//!
//! - On lance Tor, on publie un service onion qui pointe vers une écoute TCP
//!   locale, et on expose notre `.onion` au front.
//! - Les pairs Tor sont indexés par leur clé X25519 (en hexa) : pour une
//!   connexion entrante, Tor ne nous dit pas qui se connecte, mais le `Hello`
//!   porte la clé publique — c'est elle l'identité.
//! - Sur le fil : des trames `Frame` (CBOR, préfixées par leur longueur) qui
//!   transportent les mêmes `Wire`/`Ack` que libp2p. Le contenu reste chiffré
//!   par crypto_box ; Tor ajoute l'anonymat et la traversée de NAT.
//!
//! Le média des appels (WebRTC/UDP) ne passe PAS par Tor : il reste en LAN.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crypto_box::{PublicKey, SecretKey};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, oneshot};
use tokio::time::{sleep, timeout};

use crate::crypto;
use crate::net::{Ack, FileSent, FileWriter, IncomingMessage, ReceivedFile, Shared, SignalMsg, Wire, FILE_CHUNK};
use crate::tor;

const SOCKS_PORT: u16 = 19050;
const MAX_FRAME: usize = 2 * 1024 * 1024;

/// Une trame sur le fil : requête (Wire) ou réponse (Ack), comme request/response.
#[derive(Serialize, Deserialize)]
enum Frame {
    Req(Wire),
    Resp(Ack),
}

/// Commandes adressées au transport Tor depuis les commandes Tauri.
pub enum TorCmd {
    Connect(String),
    SendText { id: String, text: String },
    SendFile { id: String, path: PathBuf, reply: oneshot::Sender<Result<FileSent, String>> },
    Signal { id: String, data: String },
}

type Peers = Arc<Mutex<HashMap<String, mpsc::Sender<Frame>>>>;

pub async fn start(
    app: AppHandle,
    shared: Arc<Shared>,
    secret: Arc<SecretKey>,
    my_pub: [u8; 32],
    download_dir: PathBuf,
    tor_exe: PathBuf,
    data_dir: PathBuf,
    mut cmd_rx: mpsc::Receiver<TorCmd>,
) {
    if !tor_exe.exists() {
        let msg = format!("Tor binary missing ({})", tor_exe.display());
        eprintln!("[nyx] {msg} — Tor désactivé. Lance le script fetch-tor approprié");
        let _ = app.emit("tor_error", &msg);
        return;
    }
    let _ = std::fs::create_dir_all(&data_dir);

    let listener = match TcpListener::bind("127.0.0.1:0").await {
        Ok(l) => l,
        Err(e) => {
            let msg = format!("could not open a local port for Tor: {e}");
            eprintln!("[nyx] {msg}");
            let _ = app.emit("tor_error", &msg);
            return;
        }
    };
    let local_port = match listener.local_addr() {
        Ok(a) => a.port(),
        Err(_) => return,
    };

    let t = match tor::start(&tor_exe, &data_dir, local_port, SOCKS_PORT).await {
        Ok(t) => t,
        Err(e) => {
            let msg = format!("Tor failed to start: {e}");
            eprintln!("[nyx] {msg}");
            let _ = app.emit("tor_error", &msg);
            return;
        }
    };
    eprintln!("[nyx] service onion prêt : {}", t.onion);

    {
        let mut me = shared.me.lock().unwrap();
        me.onion = t.onion.clone();
    }
    let _ = app.emit("identity", shared.me.lock().unwrap().clone());

    let peers: Peers = Arc::new(Mutex::new(HashMap::new()));
    let inbox = Arc::new(Mutex::new(Inbox {
        secret: secret.clone(),
        my_pub,
        app: app.clone(),
        shared: shared.clone(),
        download_dir,
        files: HashMap::new(),
    }));

    // Connexions entrantes (via le service onion).
    {
        let peers = peers.clone();
        let inbox = inbox.clone();
        let shared = shared.clone();
        let app = app.clone();
        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((stream, _)) => {
                        spawn_conn(stream, None, peers.clone(), inbox.clone(), shared.clone(), app.clone());
                    }
                    Err(e) => {
                        eprintln!("[nyx] accept Tor : {e}");
                        break;
                    }
                }
            }
        });
    }

    // Commandes sortantes.
    while let Some(cmd) = cmd_rx.recv().await {
        match cmd {
            TorCmd::Connect(onion) => {
                let peers = peers.clone();
                let inbox = inbox.clone();
                let shared = shared.clone();
                let app = app.clone();
                let my_name = shared.me.lock().unwrap().name.clone();
                tokio::spawn(async move {
                    // Reaching an onion service can take a while (Tor may still
                    // be bootstrapping, the peer may be briefly offline, and
                    // building the rendezvous circuit is slow). Retry with
                    // backoff instead of failing on the first attempt, and tell
                    // the UI if we ultimately give up.
                    let deadline = Instant::now() + Duration::from_secs(180);
                    let mut delay = Duration::from_secs(2);
                    loop {
                        match timeout(Duration::from_secs(45), tor::dial(SOCKS_PORT, &onion)).await {
                            Ok(Ok(stream)) => {
                                let hello = Wire::Hello { key: my_pub, name: my_name };
                                spawn_conn(stream, Some(hello), peers, inbox, shared, app);
                                return;
                            }
                            Ok(Err(e)) => eprintln!("[nyx] onion dial failed: {e}"),
                            Err(_) => eprintln!("[nyx] onion dial timed out"),
                        }
                        if Instant::now() >= deadline {
                            let _ = app.emit(
                                "connect_error",
                                format!("Could not reach {onion}. They may be offline, or Tor is still warming up — try again."),
                            );
                            return;
                        }
                        sleep(delay).await;
                        delay = (delay * 2).min(Duration::from_secs(15));
                    }
                });
            }
            TorCmd::SendText { id, text } => {
                if let Some(pk) = shared.tor_peer_key(&id) {
                    let (body, nonce) = crypto::seal(&secret, &pk, text.as_bytes());
                    send_to(&peers, &id, Frame::Req(Wire::Msg { key: my_pub, nonce, body })).await;
                }
            }
            TorCmd::Signal { id, data } => {
                if let Some(pk) = shared.tor_peer_key(&id) {
                    let (body, nonce) = crypto::seal(&secret, &pk, data.as_bytes());
                    send_to(&peers, &id, Frame::Req(Wire::Signal { key: my_pub, nonce, body })).await;
                }
            }
            TorCmd::SendFile { id, path, reply } => {
                let r = send_file(&peers, &shared, &secret, my_pub, &id, &path).await;
                let _ = reply.send(r);
            }
        }
    }

    drop(t); // garde Tor vivant jusqu'à la fermeture de l'app
}

/// Gère une connexion (entrante ou sortante) sur sa propre tâche.
fn spawn_conn(stream: TcpStream, hello: Option<Wire>, peers: Peers, inbox: Arc<Mutex<Inbox>>, shared: Arc<Shared>, app: AppHandle) {
    tokio::spawn(async move {
        let (mut rd, wr) = stream.into_split();
        let (out_tx, out_rx) = mpsc::channel::<Frame>(64);

        // tâche d'écriture
        tokio::spawn(writer_loop(wr, out_rx));

        // si on initie, on envoie notre Hello en premier
        if let Some(h) = hello {
            let _ = out_tx.send(Frame::Req(h)).await;
        }

        let mut peer_id: Option<String> = None;
        loop {
            match read_frame(&mut rd).await {
                Ok(Frame::Req(wire)) => {
                    let id = hex(&wire.sender_key());
                    if peer_id.as_deref() != Some(&id) {
                        peers.lock().unwrap().insert(id.clone(), out_tx.clone());
                        peer_id = Some(id.clone());
                    }
                    let ack = inbox.lock().unwrap().handle(&id, wire);
                    if out_tx.send(Frame::Resp(ack)).await.is_err() {
                        break;
                    }
                }
                Ok(Frame::Resp(ack)) => {
                    if let Ack::Hello { key, .. } = &ack {
                        let id = hex(key);
                        if peer_id.is_none() {
                            peers.lock().unwrap().insert(id.clone(), out_tx.clone());
                            peer_id = Some(id.clone());
                        }
                    }
                    if let Some(id) = peer_id.clone() {
                        inbox.lock().unwrap().handle_ack(&id, ack);
                    }
                }
                Err(_) => break,
            }
        }

        // déconnexion : on retire le pair et on rafraîchit la liste
        if let Some(id) = peer_id {
            peers.lock().unwrap().remove(&id);
            shared.tor_set_online(&id, false);
            let _ = app.emit("peers", shared.peer_list());
        }
    });
}

async fn writer_loop(mut wr: OwnedWriteHalf, mut rx: mpsc::Receiver<Frame>) {
    while let Some(f) = rx.recv().await {
        if write_frame(&mut wr, &f).await.is_err() {
            break;
        }
    }
}

async fn send_to(peers: &Peers, id: &str, frame: Frame) {
    let tx = peers.lock().unwrap().get(id).cloned();
    if let Some(tx) = tx {
        let _ = tx.send(frame).await;
    }
}

async fn send_file(peers: &Peers, shared: &Arc<Shared>, secret: &SecretKey, my_pub: [u8; 32], id: &str, path: &Path) -> Result<FileSent, String> {
    let pk = shared.tor_peer_key(id).ok_or("pair Tor inconnu ou hors ligne")?;
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("fichier").to_string();
    // Stream the file from disk in chunks rather than loading it whole.
    let size = tokio::fs::metadata(path).await.map_err(|e| format!("lecture impossible : {e}"))?.len();
    let chunks = ((size + FILE_CHUNK as u64 - 1) / FILE_CHUNK as u64) as u32;
    let fid = rand::random::<u64>();
    let mut file = tokio::fs::File::open(path).await.map_err(|e| format!("lecture impossible : {e}"))?;

    send_to(peers, id, Frame::Req(Wire::FileMeta { key: my_pub, id: fid, name: name.clone(), size, chunks })).await;
    let mut buf = vec![0u8; FILE_CHUNK];
    let mut seq = 0u32;
    loop {
        let mut filled = 0;
        while filled < FILE_CHUNK {
            let n = file.read(&mut buf[filled..]).await.map_err(|e| format!("lecture impossible : {e}"))?;
            if n == 0 {
                break;
            }
            filled += n;
        }
        if filled == 0 {
            break;
        }
        let (body, nonce) = crypto::seal(secret, &pk, &buf[..filled]);
        send_to(peers, id, Frame::Req(Wire::FileChunk { key: my_pub, id: fid, seq, nonce, body })).await;
        seq += 1;
        if filled < FILE_CHUNK {
            break;
        }
    }
    Ok(FileSent { name, size, path: path.to_string_lossy().to_string() })
}

// --- Cadrage des trames (longueur u32 big-endian + CBOR) -------------------

async fn write_frame(wr: &mut OwnedWriteHalf, f: &Frame) -> std::io::Result<()> {
    let mut buf = Vec::new();
    ciborium::into_writer(f, &mut buf).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    wr.write_all(&(buf.len() as u32).to_be_bytes()).await?;
    wr.write_all(&buf).await?;
    wr.flush().await?;
    Ok(())
}

async fn read_frame(rd: &mut OwnedReadHalf) -> std::io::Result<Frame> {
    let mut len = [0u8; 4];
    rd.read_exact(&mut len).await?;
    let len = u32::from_be_bytes(len) as usize;
    if len > MAX_FRAME {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "trame trop grande"));
    }
    let mut buf = vec![0u8; len];
    rd.read_exact(&mut buf).await?;
    ciborium::from_reader(&buf[..]).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
}

fn hex(bytes: &[u8; 32]) -> String {
    let mut s = String::with_capacity(64);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

// --- Réception : déchiffrement, events, réassemblage de fichiers -----------

struct Inbox {
    secret: Arc<SecretKey>,
    my_pub: [u8; 32],
    app: AppHandle,
    shared: Arc<Shared>,
    download_dir: PathBuf,
    files: HashMap<u64, FileWriter>,
}

impl Inbox {
    fn emit_peers(&self) {
        let _ = self.app.emit("peers", self.shared.peer_list());
    }

    fn handle(&mut self, id: &str, req: Wire) -> Ack {
        match req {
            Wire::Hello { key, name } => {
                self.shared.tor_set_key_name(id.to_string(), key, name);
                let me = self.shared.me.lock().unwrap().name.clone();
                self.emit_peers();
                Ack::Hello { key: self.my_pub, name: me }
            }
            Wire::Msg { key, nonce, body } => {
                self.shared.tor_set_key(id.to_string(), key);
                if let Some(pt) = crypto::open(&self.secret, &PublicKey::from(key), &nonce, &body) {
                    if let Ok(text) = String::from_utf8(pt) {
                        let _ = self.app.emit(
                            "message",
                            IncomingMessage { peer_id: id.to_string(), name: self.shared.tor_peer_name(id), text, ts: now_ms() },
                        );
                    }
                }
                Ack::Ok
            }
            Wire::FileMeta { key, id: fid, name, size, chunks } => {
                self.shared.tor_set_key(id.to_string(), key);
                if self.ensure_writer(fid) {
                    if let Some(w) = self.files.get_mut(&fid) {
                        w.set_meta(name, size, chunks);
                    }
                }
                self.try_finalize(fid, id);
                Ack::Ok
            }
            Wire::FileChunk { key, id: fid, seq, nonce, body } => {
                self.shared.tor_set_key(id.to_string(), key);
                if self.ensure_writer(fid) {
                    if let Some(pt) = crypto::open(&self.secret, &PublicKey::from(key), &nonce, &body) {
                        if let Some(w) = self.files.get_mut(&fid) {
                            w.write_chunk(seq, &pt);
                        }
                    }
                }
                self.try_finalize(fid, id);
                Ack::Ok
            }
            Wire::Signal { key, nonce, body } => {
                self.shared.tor_set_key(id.to_string(), key);
                if let Some(pt) = crypto::open(&self.secret, &PublicKey::from(key), &nonce, &body) {
                    if let Ok(data) = String::from_utf8(pt) {
                        let _ = self.app.emit("signal", SignalMsg { peer_id: id.to_string(), data });
                    }
                }
                Ack::Ok
            }
        }
    }

    fn handle_ack(&mut self, id: &str, ack: Ack) {
        if let Ack::Hello { key, name } = ack {
            self.shared.tor_set_key_name(id.to_string(), key, name);
            self.emit_peers();
        }
    }

    fn ensure_writer(&mut self, fid: u64) -> bool {
        if self.files.contains_key(&fid) {
            return true;
        }
        match FileWriter::open(&self.download_dir, fid) {
            Ok(w) => {
                self.files.insert(fid, w);
                true
            }
            Err(e) => {
                eprintln!("[nyx] fichier Tor : ouverture impossible : {e}");
                false
            }
        }
    }

    fn try_finalize(&mut self, fid: u64, from: &str) {
        let done = self.files.get(&fid).map_or(false, |w| w.is_complete());
        if !done {
            return;
        }
        let writer = self.files.remove(&fid).unwrap();
        match writer.finalize(&self.download_dir, fid) {
            Ok((dest, size, file_name)) => {
                let _ = self.app.emit(
                    "file",
                    ReceivedFile {
                        peer_id: from.to_string(),
                        from_name: self.shared.tor_peer_name(from),
                        file_name,
                        size,
                        path: dest.to_string_lossy().to_string(),
                        ts: now_ms(),
                    },
                );
            }
            Err(e) => eprintln!("[nyx] écriture du fichier Tor échouée : {e}"),
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}
