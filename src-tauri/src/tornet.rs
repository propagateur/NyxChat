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

use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use crypto_box::{PublicKey, SecretKey};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, oneshot};

use crate::crypto;
use crate::net::{Ack, FileSent, IncomingMessage, ReceivedFile, Shared, SignalMsg, Wire, FILE_CHUNK};
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
        eprintln!(
            "[nyx] tor.exe absent ({}) — Tor désactivé. Lance scripts/fetch-tor.ps1",
            tor_exe.display()
        );
        return;
    }
    let _ = std::fs::create_dir_all(&data_dir);

    let listener = match TcpListener::bind("127.0.0.1:0").await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[nyx] écoute Tor locale impossible : {e}");
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
            eprintln!("[nyx] Tor indisponible : {e}");
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
                    match tor::dial(SOCKS_PORT, &onion).await {
                        Ok(stream) => {
                            let hello = Wire::Hello { key: my_pub, name: my_name };
                            spawn_conn(stream, Some(hello), peers, inbox, shared, app);
                        }
                        Err(e) => eprintln!("[nyx] connexion onion échouée : {e}"),
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
    let data = tokio::fs::read(path).await.map_err(|e| format!("lecture impossible : {e}"))?;
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("fichier").to_string();
    let size = data.len() as u64;
    let chunks = ((data.len() + FILE_CHUNK - 1) / FILE_CHUNK) as u32;
    let fid = rand::random::<u64>();

    send_to(peers, id, Frame::Req(Wire::FileMeta { key: my_pub, id: fid, name: name.clone(), size, chunks })).await;
    for (seq, chunk) in data.chunks(FILE_CHUNK).enumerate() {
        let (body, nonce) = crypto::seal(secret, &pk, chunk);
        send_to(peers, id, Frame::Req(Wire::FileChunk { key: my_pub, id: fid, seq: seq as u32, nonce, body })).await;
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

struct FileAsm {
    from: String,
    sender_key: PublicKey,
    name: Option<String>,
    size: u64,
    total: Option<u32>,
    parts: BTreeMap<u32, Vec<u8>>,
}

impl FileAsm {
    fn new(from: String, key: [u8; 32]) -> Self {
        FileAsm { from, sender_key: PublicKey::from(key), name: None, size: 0, total: None, parts: BTreeMap::new() }
    }
}

struct Inbox {
    secret: Arc<SecretKey>,
    my_pub: [u8; 32],
    app: AppHandle,
    shared: Arc<Shared>,
    download_dir: PathBuf,
    files: HashMap<u64, FileAsm>,
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
                {
                    let a = self.files.entry(fid).or_insert_with(|| FileAsm::new(id.to_string(), key));
                    a.name = Some(name);
                    a.size = size;
                    a.total = Some(chunks);
                }
                self.try_finalize(fid);
                Ack::Ok
            }
            Wire::FileChunk { key, id: fid, seq, nonce, body } => {
                let their = {
                    let a = self.files.entry(fid).or_insert_with(|| FileAsm::new(id.to_string(), key));
                    a.sender_key.clone()
                };
                if let Some(pt) = crypto::open(&self.secret, &their, &nonce, &body) {
                    if let Some(a) = self.files.get_mut(&fid) {
                        a.parts.entry(seq).or_insert(pt);
                    }
                }
                self.try_finalize(fid);
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

    fn try_finalize(&mut self, fid: u64) {
        let done = match self.files.get(&fid) {
            Some(a) => a.total.map_or(false, |t| a.parts.len() as u32 == t),
            None => false,
        };
        if !done {
            return;
        }
        let a = self.files.remove(&fid).unwrap();
        let mut data = Vec::with_capacity(a.size as usize);
        for part in a.parts.values() {
            data.extend_from_slice(part);
        }
        let file_name = a.name.unwrap_or_else(|| format!("nyx-{fid}"));
        let _ = std::fs::create_dir_all(&self.download_dir);
        let dest = unique_path(&self.download_dir, &file_name);
        match std::fs::write(&dest, &data) {
            Ok(()) => {
                let _ = self.app.emit(
                    "file",
                    ReceivedFile {
                        peer_id: a.from.clone(),
                        from_name: self.shared.tor_peer_name(&a.from),
                        file_name,
                        size: data.len() as u64,
                        path: dest.to_string_lossy().to_string(),
                        ts: now_ms(),
                    },
                );
            }
            Err(e) => eprintln!("[nyx] écriture du fichier Tor échouée : {e}"),
        }
    }
}

fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let p = Path::new(name);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("fichier");
    let ext = p.extension().and_then(|s| s.to_str());
    let mut i = 1;
    loop {
        let candidate = match ext {
            Some(e) => dir.join(format!("{stem} ({i}).{e}")),
            None => dir.join(format!("{stem} ({i})")),
        };
        if !candidate.exists() {
            return candidate;
        }
        i += 1;
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}
