//! Pile réseau pair-à-pair : découverte mDNS, transport chiffré (Noise),
//! et un protocole request/response qui transporte nos enveloppes chiffrées
//! (messages texte et fichiers).
//!
//! Tout le swarm vit dans une seule tâche async (`run`). Le reste de l'app lui
//! parle via un canal de commandes et reçoit les nouveautés via les events
//! Tauri. Ça évite d'avoir à rendre le Swarm partageable entre threads.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crypto_box::{PublicKey, SecretKey};
use futures::StreamExt;
use libp2p::identity::Keypair;
use libp2p::request_response::{self, ProtocolSupport, ResponseChannel};
use libp2p::swarm::{NetworkBehaviour, SwarmEvent};
use libp2p::{mdns, noise, tcp, yamux, PeerId, StreamProtocol, Swarm};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, oneshot};

use crate::crypto;

const PROTOCOL: &str = "/nyxchat/1.0.0";
const FILE_CHUNK: usize = 256 * 1024; // 256 KiB par morceau chiffré

// --- Format des messages sur le fil ---------------------------------------

/// On joint la clé publique de l'expéditeur à chaque message : ainsi le
/// destinataire peut toujours reconstruire la boîte de chiffrement, même s'il a
/// raté le Hello initial (reconnexion, redémarrage…).
#[derive(Debug, Clone, Serialize, Deserialize)]
enum Wire {
    Hello { key: [u8; 32], name: String },
    Msg { key: [u8; 32], nonce: [u8; 24], body: Vec<u8> },
    // Un fichier = un FileMeta puis N FileChunk. Chaque morceau est chiffré
    // séparément ; ils peuvent arriver dans le désordre (streams libp2p
    // distincts), d'où le numéro de séquence.
    FileMeta { key: [u8; 32], id: u64, name: String, size: u64, chunks: u32 },
    FileChunk { key: [u8; 32], id: u64, seq: u32, nonce: [u8; 24], body: Vec<u8> },
    // Signalisation WebRTC (offre/réponse SDP, candidats ICE). Le contenu est
    // un blob JSON opaque produit par le front ; on ne fait que le relayer
    // chiffré. Le média lui-même ne passe pas par là, il va en direct.
    Signal { key: [u8; 32], nonce: [u8; 24], body: Vec<u8> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum Ack {
    Ok,
    Hello { key: [u8; 32], name: String },
}

#[derive(NetworkBehaviour)]
struct Behaviour {
    mdns: mdns::tokio::Behaviour,
    rr: request_response::cbor::Behaviour<Wire, Ack>,
}

// --- Vues exposées au front -----------------------------------------------

#[derive(Clone, Serialize)]
pub struct Identity {
    pub peer_id: String,
    pub name: String,
    pub fingerprint: String,
}

#[derive(Clone, Serialize)]
pub struct PeerView {
    pub peer_id: String,
    pub name: Option<String>,
    pub fingerprint: Option<String>,
    pub online: bool,
}

#[derive(Clone, Serialize)]
pub struct IncomingMessage {
    pub peer_id: String,
    pub name: Option<String>,
    pub text: String,
    pub ts: u64,
}

#[derive(Clone, Serialize)]
pub struct FileSent {
    pub name: String,
    pub size: u64,
}

#[derive(Clone, Serialize)]
pub struct ReceivedFile {
    pub peer_id: String,
    pub from_name: Option<String>,
    pub file_name: String,
    pub size: u64,
    pub path: String,
    pub ts: u64,
}

#[derive(Clone, Serialize)]
pub struct SignalMsg {
    pub peer_id: String,
    pub data: String,
}

// --- État partagé entre les commandes Tauri et l'acteur réseau -------------

struct PeerRecord {
    name: Option<String>,
    key: Option<PublicKey>,
    online: bool,
}

impl PeerRecord {
    fn blank() -> Self {
        PeerRecord { name: None, key: None, online: false }
    }
}

pub struct Shared {
    pub me: Mutex<Identity>,
    peers: Mutex<HashMap<PeerId, PeerRecord>>,
    data_dir: PathBuf,
}

impl Shared {
    pub fn new(me: Identity, data_dir: PathBuf) -> Self {
        Shared { me: Mutex::new(me), peers: Mutex::new(HashMap::new()), data_dir }
    }

    /// On garde le pseudo choisi entre deux lancements.
    pub fn save_name(&self, name: &str) {
        let _ = fs::write(self.data_dir.join("name.txt"), name);
    }

    fn touch(&self, p: PeerId) {
        self.peers.lock().unwrap().entry(p).or_insert_with(PeerRecord::blank);
    }

    fn set_online(&self, p: &PeerId, on: bool) {
        let mut m = self.peers.lock().unwrap();
        m.entry(*p).or_insert_with(PeerRecord::blank).online = on;
    }

    fn set_key(&self, p: PeerId, key: [u8; 32]) {
        let mut m = self.peers.lock().unwrap();
        m.entry(p).or_insert_with(PeerRecord::blank).key = Some(PublicKey::from(key));
    }

    fn set_key_name(&self, p: PeerId, key: [u8; 32], name: String) {
        let mut m = self.peers.lock().unwrap();
        let r = m.entry(p).or_insert_with(PeerRecord::blank);
        r.key = Some(PublicKey::from(key));
        if !name.is_empty() {
            r.name = Some(name);
        }
    }

    fn peer_key(&self, p: &PeerId) -> Option<PublicKey> {
        self.peers.lock().unwrap().get(p).and_then(|r| r.key.clone())
    }

    fn peer_name(&self, p: &PeerId) -> Option<String> {
        self.peers.lock().unwrap().get(p).and_then(|r| r.name.clone())
    }

    pub fn peer_list(&self) -> Vec<PeerView> {
        let m = self.peers.lock().unwrap();
        let mut out: Vec<PeerView> = m
            .iter()
            .map(|(p, r)| PeerView {
                peer_id: p.to_string(),
                name: r.name.clone(),
                fingerprint: r.key.as_ref().map(|k| crypto::fingerprint(k.as_bytes())),
                online: r.online,
            })
            .collect();
        // les pairs en ligne d'abord, puis ordre stable par id
        out.sort_by(|a, b| b.online.cmp(&a.online).then(a.peer_id.cmp(&b.peer_id)));
        out
    }
}

// --- Commandes envoyées à l'acteur ----------------------------------------

pub enum Command {
    Send { peer: PeerId, text: String, reply: oneshot::Sender<Result<(), String>> },
    SendFile { peer: PeerId, path: PathBuf, reply: oneshot::Sender<Result<FileSent, String>> },
    Signal { peer: PeerId, data: String }, // signalisation WebRTC, on l'envoie sans attendre
    Broadcast(String), // diffuser un changement de nom aux pairs connectés
}

// --- Réassemblage d'un fichier en cours de réception ----------------------

struct FileAsm {
    from: PeerId,
    sender_key: PublicKey,
    name: Option<String>,
    size: u64,
    total: Option<u32>,
    parts: BTreeMap<u32, Vec<u8>>,
}

impl FileAsm {
    fn new(from: PeerId, key: [u8; 32]) -> Self {
        FileAsm {
            from,
            sender_key: PublicKey::from(key),
            name: None,
            size: 0,
            total: None,
            parts: BTreeMap::new(),
        }
    }
}

// --- Persistance de l'identité --------------------------------------------

/// Pseudo sauvegardé, sinon le nom de session de l'OS, sinon "Anonyme".
pub fn load_name(dir: &Path) -> String {
    if let Ok(n) = fs::read_to_string(dir.join("name.txt")) {
        let n = n.trim();
        if !n.is_empty() {
            return n.to_string();
        }
    }
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "Anonyme".to_string())
}

/// Charge l'identité depuis le disque, ou la crée au premier lancement. On veut
/// une identité stable : c'est ce qui donne une empreinte constante d'une
/// session à l'autre.
pub fn load_or_create_identity(dir: &Path) -> (Keypair, SecretKey) {
    let id_path = dir.join("identity.key");
    let e2e_path = dir.join("e2e.key");

    let keypair = match fs::read(&id_path) {
        Ok(bytes) => Keypair::from_protobuf_encoding(&bytes).expect("identity.key corrompu"),
        Err(_) => {
            let kp = Keypair::generate_ed25519();
            if let Ok(enc) = kp.to_protobuf_encoding() {
                let _ = fs::write(&id_path, enc);
            }
            kp
        }
    };

    let secret = match fs::read(&e2e_path) {
        Ok(bytes) if bytes.len() == 32 => {
            let mut a = [0u8; 32];
            a.copy_from_slice(&bytes);
            SecretKey::from(a)
        }
        _ => {
            let s = SecretKey::generate(&mut OsRng);
            let _ = fs::write(&e2e_path, s.to_bytes());
            s
        }
    };

    (keypair, secret)
}

// --- Boucle réseau ---------------------------------------------------------

pub async fn run(
    id_keys: Keypair,
    secret: SecretKey,
    shared: Arc<Shared>,
    app: AppHandle,
    mut cmd_rx: mpsc::Receiver<Command>,
    download_dir: PathBuf,
) {
    let local = id_keys.public().to_peer_id();
    let my_pub: [u8; 32] = *secret.public_key().as_bytes();

    let mut swarm = match build_swarm(id_keys) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[nyx] impossible de démarrer le réseau : {e}");
            return;
        }
    };

    if let Err(e) = swarm.listen_on("/ip4/0.0.0.0/tcp/0".parse().unwrap()) {
        eprintln!("[nyx] écoute impossible : {e}");
    }

    let mut ctx = Ctx {
        shared,
        app,
        secret,
        my_pub,
        local,
        dialed: HashSet::new(),
        incoming: HashMap::new(),
        download_dir,
    };

    loop {
        tokio::select! {
            cmd = cmd_rx.recv() => match cmd {
                Some(c) => ctx.handle_command(&mut swarm, c),
                None => break, // l'app se ferme
            },
            event = swarm.select_next_some() => ctx.handle_event(&mut swarm, event),
        }
    }
}

fn build_swarm(id_keys: Keypair) -> Result<Swarm<Behaviour>, Box<dyn std::error::Error>> {
    let swarm = libp2p::SwarmBuilder::with_existing_identity(id_keys)
        .with_tokio()
        .with_tcp(tcp::Config::default(), noise::Config::new, yamux::Config::default)?
        .with_behaviour(|key| {
            let mdns = mdns::tokio::Behaviour::new(mdns::Config::default(), key.public().to_peer_id())?;
            let rr = request_response::cbor::Behaviour::new(
                [(StreamProtocol::new(PROTOCOL), ProtocolSupport::Full)],
                request_response::Config::default(),
            );
            Ok(Behaviour { mdns, rr })
        })?
        // Connexions gardées ouvertes longtemps : une conversation peut rester
        // silencieuse un moment sans qu'on veuille se déconnecter.
        .with_swarm_config(|c| c.with_idle_connection_timeout(Duration::from_secs(3600)))
        .build();
    Ok(swarm)
}

/// Tout l'état mutable de l'acteur. Le `Swarm` reste à part (passé en argument)
/// pour ne pas se battre avec l'emprunt de `select!`.
struct Ctx {
    shared: Arc<Shared>,
    app: AppHandle,
    secret: SecretKey,
    my_pub: [u8; 32],
    local: PeerId,
    dialed: HashSet<PeerId>,
    incoming: HashMap<u64, FileAsm>,
    download_dir: PathBuf,
}

impl Ctx {
    fn emit_peers(&self) {
        let _ = self.app.emit("peers", self.shared.peer_list());
    }

    fn handle_command(&mut self, swarm: &mut Swarm<Behaviour>, cmd: Command) {
        match cmd {
            Command::Send { peer, text, reply } => {
                let r = match self.shared.peer_key(&peer) {
                    Some(pk) => {
                        let (body, nonce) = crypto::seal(&self.secret, &pk, text.as_bytes());
                        swarm.behaviour_mut().rr.send_request(&peer, Wire::Msg { key: self.my_pub, nonce, body });
                        Ok(())
                    }
                    None => Err("clé du pair pas encore échangée".to_string()),
                };
                let _ = reply.send(r);
            }
            Command::SendFile { peer, path, reply } => {
                let r = self.send_file(swarm, &peer, &path);
                let _ = reply.send(r);
            }
            Command::Signal { peer, data } => {
                if let Some(pk) = self.shared.peer_key(&peer) {
                    let (body, nonce) = crypto::seal(&self.secret, &pk, data.as_bytes());
                    swarm.behaviour_mut().rr.send_request(&peer, Wire::Signal { key: self.my_pub, nonce, body });
                }
            }
            Command::Broadcast(name) => {
                let peers: Vec<PeerId> = swarm.connected_peers().copied().collect();
                for p in peers {
                    swarm.behaviour_mut().rr.send_request(&p, Wire::Hello { key: self.my_pub, name: name.clone() });
                }
            }
        }
    }

    fn send_file(&mut self, swarm: &mut Swarm<Behaviour>, peer: &PeerId, path: &Path) -> Result<FileSent, String> {
        let pk = self.shared.peer_key(peer).ok_or("clé du pair pas encore échangée")?;
        let data = fs::read(path).map_err(|e| format!("lecture impossible : {e}"))?;
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("fichier")
            .to_string();
        let size = data.len() as u64;
        let chunks = ((data.len() + FILE_CHUNK - 1) / FILE_CHUNK) as u32;
        let id = OsRng.next_u64();

        swarm.behaviour_mut().rr.send_request(
            peer,
            Wire::FileMeta { key: self.my_pub, id, name: name.clone(), size, chunks },
        );
        for (seq, chunk) in data.chunks(FILE_CHUNK).enumerate() {
            let (body, nonce) = crypto::seal(&self.secret, &pk, chunk);
            swarm.behaviour_mut().rr.send_request(
                peer,
                Wire::FileChunk { key: self.my_pub, id, seq: seq as u32, nonce, body },
            );
        }
        Ok(FileSent { name, size })
    }

    fn handle_event(&mut self, swarm: &mut Swarm<Behaviour>, event: SwarmEvent<BehaviourEvent>) {
        match event {
            SwarmEvent::NewListenAddr { address, .. } => {
                eprintln!("[nyx] à l'écoute sur {address}");
            }

            SwarmEvent::Behaviour(BehaviourEvent::Mdns(mdns::Event::Discovered(list))) => {
                for (peer, addr) in list {
                    if peer == self.local {
                        continue;
                    }
                    self.shared.touch(peer);
                    if !swarm.is_connected(&peer) && self.dialed.insert(peer) {
                        if let Err(e) = swarm.dial(addr) {
                            eprintln!("[nyx] dial {peer} échoué : {e}");
                            self.dialed.remove(&peer);
                        }
                    }
                }
                self.emit_peers();
            }

            SwarmEvent::Behaviour(BehaviourEvent::Mdns(mdns::Event::Expired(list))) => {
                // L'expiration mDNS ne veut pas dire que le lien est mort : on ne
                // marque hors ligne que si on n'a plus de connexion vivante.
                for (peer, _addr) in list {
                    if !swarm.is_connected(&peer) {
                        self.shared.set_online(&peer, false);
                        self.dialed.remove(&peer);
                    }
                }
                self.emit_peers();
            }

            SwarmEvent::ConnectionEstablished { peer_id, .. } => {
                self.shared.set_online(&peer_id, true);
                let name = self.shared.me.lock().unwrap().name.clone();
                swarm.behaviour_mut().rr.send_request(&peer_id, Wire::Hello { key: self.my_pub, name });
                self.emit_peers();
            }

            SwarmEvent::ConnectionClosed { peer_id, num_established, .. } => {
                if num_established == 0 {
                    self.shared.set_online(&peer_id, false);
                    self.dialed.remove(&peer_id);
                    self.emit_peers();
                }
            }

            SwarmEvent::Behaviour(BehaviourEvent::Rr(request_response::Event::Message { peer, message, .. })) => {
                match message {
                    request_response::Message::Request { request, channel, .. } => {
                        self.on_request(swarm, peer, request, channel);
                    }
                    request_response::Message::Response { response, .. } => {
                        if let Ack::Hello { key, name } = response {
                            self.shared.set_key_name(peer, key, name);
                            self.emit_peers();
                        }
                    }
                }
            }

            _ => {}
        }
    }

    fn on_request(&mut self, swarm: &mut Swarm<Behaviour>, peer: PeerId, req: Wire, channel: ResponseChannel<Ack>) {
        match req {
            Wire::Hello { key, name } => {
                self.shared.set_key_name(peer, key, name);
                let me = self.shared.me.lock().unwrap().name.clone();
                let _ = swarm.behaviour_mut().rr.send_response(channel, Ack::Hello { key: self.my_pub, name: me });
                self.emit_peers();
            }

            Wire::Msg { key, nonce, body } => {
                self.shared.set_key(peer, key);
                let their = PublicKey::from(key);
                match crypto::open(&self.secret, &their, &nonce, &body) {
                    Some(pt) => {
                        if let Ok(text) = String::from_utf8(pt) {
                            let _ = self.app.emit(
                                "message",
                                IncomingMessage {
                                    peer_id: peer.to_string(),
                                    name: self.shared.peer_name(&peer),
                                    text,
                                    ts: now_ms(),
                                },
                            );
                        }
                    }
                    None => eprintln!("[nyx] message de {peer} indéchiffrable (rejeté)"),
                }
                let _ = swarm.behaviour_mut().rr.send_response(channel, Ack::Ok);
            }

            Wire::FileMeta { key, id, name, size, chunks } => {
                self.shared.set_key(peer, key);
                {
                    let asm = self.incoming.entry(id).or_insert_with(|| FileAsm::new(peer, key));
                    asm.name = Some(name);
                    asm.size = size;
                    asm.total = Some(chunks);
                }
                let _ = swarm.behaviour_mut().rr.send_response(channel, Ack::Ok);
                self.try_finalize(id); // cas fichier vide (0 morceau)
            }

            Wire::FileChunk { key, id, seq, nonce, body } => {
                let their = {
                    let asm = self.incoming.entry(id).or_insert_with(|| FileAsm::new(peer, key));
                    asm.sender_key.clone()
                };
                match crypto::open(&self.secret, &their, &nonce, &body) {
                    Some(pt) => {
                        if let Some(asm) = self.incoming.get_mut(&id) {
                            asm.parts.entry(seq).or_insert(pt);
                        }
                    }
                    None => eprintln!("[nyx] morceau de fichier de {peer} indéchiffrable"),
                }
                let _ = swarm.behaviour_mut().rr.send_response(channel, Ack::Ok);
                self.try_finalize(id);
            }

            Wire::Signal { key, nonce, body } => {
                self.shared.set_key(peer, key);
                let their = PublicKey::from(key);
                if let Some(pt) = crypto::open(&self.secret, &their, &nonce, &body) {
                    if let Ok(data) = String::from_utf8(pt) {
                        let _ = self.app.emit("signal", SignalMsg { peer_id: peer.to_string(), data });
                    }
                }
                let _ = swarm.behaviour_mut().rr.send_response(channel, Ack::Ok);
            }
        }
    }

    /// Si tous les morceaux sont là, on recolle, on écrit dans Téléchargements
    /// et on prévient le front.
    fn try_finalize(&mut self, id: u64) {
        let done = match self.incoming.get(&id) {
            Some(a) => a.total.map_or(false, |t| a.parts.len() as u32 == t),
            None => false,
        };
        if !done {
            return;
        }
        let asm = self.incoming.remove(&id).unwrap();

        let mut data = Vec::with_capacity(asm.size as usize);
        for part in asm.parts.values() {
            data.extend_from_slice(part);
        }

        let file_name = asm.name.unwrap_or_else(|| format!("nyx-{id}"));
        let _ = fs::create_dir_all(&self.download_dir);
        let dest = unique_path(&self.download_dir, &file_name);

        match fs::write(&dest, &data) {
            Ok(()) => {
                let _ = self.app.emit(
                    "file",
                    ReceivedFile {
                        peer_id: asm.from.to_string(),
                        from_name: self.shared.peer_name(&asm.from),
                        file_name,
                        size: data.len() as u64,
                        path: dest.to_string_lossy().to_string(),
                        ts: now_ms(),
                    },
                );
            }
            Err(e) => eprintln!("[nyx] écriture du fichier reçu échouée : {e}"),
        }
    }
}

/// Évite d'écraser un fichier existant : `photo.png` → `photo (1).png`, etc.
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
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
