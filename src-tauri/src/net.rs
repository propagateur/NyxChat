use std::collections::{HashMap, HashSet};
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
pub(crate) const FILE_CHUNK: usize = 256 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) enum Wire {
    Hello { key: [u8; 32], name: String },
    Msg { key: [u8; 32], nonce: [u8; 24], body: Vec<u8> },
    FileMeta { key: [u8; 32], id: u64, name: String, size: u64, chunks: u32 },
    FileChunk { key: [u8; 32], id: u64, seq: u32, nonce: [u8; 24], body: Vec<u8> },
    Signal { key: [u8; 32], nonce: [u8; 24], body: Vec<u8> },
    GroupMsg { key: [u8; 32], gid: String, nonce: [u8; 24], body: Vec<u8> },
    GroupInvite { key: [u8; 32], nonce: [u8; 24], body: Vec<u8> },
    GroupLeave { key: [u8; 32], gid: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct GroupMeta {
    pub id: String,
    pub name: String,
    pub members: Vec<String>,
}

impl Wire {
    pub(crate) fn sender_key(&self) -> [u8; 32] {
        match self {
            Wire::Hello { key, .. }
            | Wire::Msg { key, .. }
            | Wire::FileMeta { key, .. }
            | Wire::FileChunk { key, .. }
            | Wire::Signal { key, .. }
            | Wire::GroupMsg { key, .. }
            | Wire::GroupInvite { key, .. }
            | Wire::GroupLeave { key, .. } => *key,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) enum Ack {
    Ok,
    Hello { key: [u8; 32], name: String },
}

#[derive(NetworkBehaviour)]
struct Behaviour {
    mdns: mdns::tokio::Behaviour,
    rr: request_response::cbor::Behaviour<Wire, Ack>,
}

#[derive(Clone, Serialize)]
pub struct Identity {
    pub peer_id: String,
    pub key: String,
    pub name: String,
    pub fingerprint: String,
    pub onion: String,
}

#[derive(Clone, Serialize)]
pub struct PeerView {
    pub peer_id: String,
    pub key: Option<String>,
    pub name: Option<String>,
    pub fingerprint: Option<String>,
    pub online: bool,
    pub transport: String,
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
    pub path: String,
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

#[derive(Clone, Serialize)]
pub struct GroupMessage {
    pub gid: String,
    pub peer_id: String,
    pub name: Option<String>,
    pub text: String,
    pub ts: u64,
}

#[derive(Clone, Serialize)]
pub struct GroupInviteEvent {
    pub gid: String,
    pub name: String,
    pub members: Vec<String>,
    pub from: String,
}

#[derive(Clone, Serialize)]
pub struct GroupLeaveEvent {
    pub gid: String,
    pub peer_id: String,
}

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
    tor: Mutex<HashMap<String, PeerRecord>>,
    data_dir: PathBuf,
}

impl Shared {
    pub fn new(me: Identity, data_dir: PathBuf) -> Self {
        Shared {
            me: Mutex::new(me),
            peers: Mutex::new(HashMap::new()),
            tor: Mutex::new(HashMap::new()),
            data_dir,
        }
    }

    pub(crate) fn tor_set_key_name(&self, id: String, key: [u8; 32], name: String) {
        let mut m = self.tor.lock().unwrap();
        let r = m.entry(id).or_insert_with(PeerRecord::blank);
        r.key = Some(PublicKey::from(key));
        r.online = true;
        if !name.is_empty() {
            r.name = Some(name);
        }
    }

    pub(crate) fn tor_set_key(&self, id: String, key: [u8; 32]) {
        let mut m = self.tor.lock().unwrap();
        m.entry(id).or_insert_with(PeerRecord::blank).key = Some(PublicKey::from(key));
    }

    pub(crate) fn tor_set_online(&self, id: &str, on: bool) {
        let mut m = self.tor.lock().unwrap();
        if let Some(r) = m.get_mut(id) {
            r.online = on;
        }
    }

    pub(crate) fn tor_peer_key(&self, id: &str) -> Option<PublicKey> {
        self.tor.lock().unwrap().get(id).and_then(|r| r.key.clone())
    }

    pub(crate) fn tor_peer_name(&self, id: &str) -> Option<String> {
        self.tor.lock().unwrap().get(id).and_then(|r| r.name.clone())
    }

    pub fn is_tor_peer(&self, id: &str) -> bool {
        self.tor.lock().unwrap().contains_key(id)
    }

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

    pub fn lan_peer_by_key(&self, key_hex: &str) -> Option<PeerId> {
        self.peers.lock().unwrap().iter().find_map(|(p, r)| match &r.key {
            Some(k) if crypto::hex(k.as_bytes()) == key_hex => Some(*p),
            _ => None,
        })
    }

    fn peer_name(&self, p: &PeerId) -> Option<String> {
        self.peers.lock().unwrap().get(p).and_then(|r| r.name.clone())
    }

    pub fn peer_list(&self) -> Vec<PeerView> {
        let mut out: Vec<PeerView> = self
            .peers
            .lock()
            .unwrap()
            .iter()
            .map(|(p, r)| PeerView {
                peer_id: p.to_string(),
                key: r.key.as_ref().map(|k| crypto::hex(k.as_bytes())),
                name: r.name.clone(),
                fingerprint: r.key.as_ref().map(|k| crypto::fingerprint(k.as_bytes())),
                online: r.online,
                transport: "lan".to_string(),
            })
            .collect();

        out.extend(self.tor.lock().unwrap().iter().map(|(id, r)| PeerView {
            peer_id: id.clone(),
            key: r.key.as_ref().map(|k| crypto::hex(k.as_bytes())),
            name: r.name.clone(),
            fingerprint: r.key.as_ref().map(|k| crypto::fingerprint(k.as_bytes())),
            online: r.online,
            transport: "tor".to_string(),
        }));

        out.sort_by(|a, b| b.online.cmp(&a.online).then(a.peer_id.cmp(&b.peer_id)));
        out
    }
}

pub enum Command {
    Send { peer: PeerId, text: String, reply: oneshot::Sender<Result<(), String>> },
    SendFile { peer: PeerId, path: PathBuf, reply: oneshot::Sender<Result<FileSent, String>> },
    Signal { peer: PeerId, data: String },
    Broadcast(String),
    GroupMsg { peer: PeerId, gid: String, text: String },
    GroupInvite { peer: PeerId, gid: String, name: String, members: Vec<String> },
    GroupLeave { peer: PeerId, gid: String },
}

pub(crate) struct FileWriter {
    file: fs::File,
    temp_path: PathBuf,
    name: Option<String>,
    size: u64,
    total: Option<u32>,
    seen: HashSet<u32>,
}

impl FileWriter {
    pub(crate) fn open(download_dir: &Path, id: u64) -> std::io::Result<Self> {
        fs::create_dir_all(download_dir)?;
        let temp_path = download_dir.join(format!(".nyx-{id}.part"));
        let file = fs::OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .truncate(true)
            .open(&temp_path)?;
        Ok(FileWriter { file, temp_path, name: None, size: 0, total: None, seen: HashSet::new() })
    }

    pub(crate) fn set_meta(&mut self, name: String, size: u64, total: u32) {
        self.name = Some(name);
        self.size = size;
        self.total = Some(total);
    }

    pub(crate) fn write_chunk(&mut self, seq: u32, data: &[u8]) {
        use std::io::{Seek, SeekFrom, Write};
        if let Some(total) = self.total {
            if seq >= total {
                return;
            }
        }
        if self.seen.contains(&seq) {
            return;
        }
        let offset = seq as u64 * FILE_CHUNK as u64;
        if self.file.seek(SeekFrom::Start(offset)).and_then(|_| self.file.write_all(data)).is_ok() {
            self.seen.insert(seq);
        }
    }

    pub(crate) fn is_complete(&self) -> bool {
        self.total.map_or(false, |t| self.seen.len() as u32 == t)
    }

    pub(crate) fn finalize(mut self, download_dir: &Path, id: u64) -> std::io::Result<(PathBuf, u64, String)> {
        use std::io::Write;
        let _ = self.file.flush();
        drop(self.file);
        let name = self.name.unwrap_or_else(|| format!("nyx-{id}"));
        let dest = unique_path(download_dir, &name);
        fs::rename(&self.temp_path, &dest)?;
        Ok((dest, self.size, name))
    }
}

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

    cleanup_partials(&download_dir);

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
                None => break,
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
        .with_swarm_config(|c| c.with_idle_connection_timeout(Duration::from_secs(3600)))
        .build();
    Ok(swarm)
}

struct Ctx {
    shared: Arc<Shared>,
    app: AppHandle,
    secret: SecretKey,
    my_pub: [u8; 32],
    local: PeerId,
    dialed: HashSet<PeerId>,
    incoming: HashMap<u64, FileWriter>,
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
            Command::GroupMsg { peer, gid, text } => {
                if let Some(pk) = self.shared.peer_key(&peer) {
                    let (body, nonce) = crypto::seal(&self.secret, &pk, text.as_bytes());
                    swarm.behaviour_mut().rr.send_request(&peer, Wire::GroupMsg { key: self.my_pub, gid, nonce, body });
                }
            }
            Command::GroupInvite { peer, gid, name, members } => {
                if let Some(pk) = self.shared.peer_key(&peer) {
                    let meta = GroupMeta { id: gid, name, members };
                    let mut buf = Vec::new();
                    if ciborium::into_writer(&meta, &mut buf).is_ok() {
                        let (body, nonce) = crypto::seal(&self.secret, &pk, &buf);
                        swarm.behaviour_mut().rr.send_request(&peer, Wire::GroupInvite { key: self.my_pub, nonce, body });
                    }
                }
            }
            Command::GroupLeave { peer, gid } => {
                swarm.behaviour_mut().rr.send_request(&peer, Wire::GroupLeave { key: self.my_pub, gid });
            }
        }
    }

    fn send_file(&mut self, swarm: &mut Swarm<Behaviour>, peer: &PeerId, path: &Path) -> Result<FileSent, String> {
        let pk = self.shared.peer_key(peer).ok_or("clé du pair pas encore échangée")?;
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("fichier")
            .to_string();
        let size = fs::metadata(path).map_err(|e| format!("lecture impossible : {e}"))?.len();
        let chunks = ((size + FILE_CHUNK as u64 - 1) / FILE_CHUNK as u64) as u32;
        let id = OsRng.next_u64();
        let mut file = fs::File::open(path).map_err(|e| format!("lecture impossible : {e}"))?;

        swarm.behaviour_mut().rr.send_request(
            peer,
            Wire::FileMeta { key: self.my_pub, id, name: name.clone(), size, chunks },
        );
        let mut buf = vec![0u8; FILE_CHUNK];
        let mut seq = 0u32;
        loop {
            let filled = read_chunk(&mut file, &mut buf).map_err(|e| format!("lecture impossible : {e}"))?;
            if filled == 0 {
                break;
            }
            let (body, nonce) = crypto::seal(&self.secret, &pk, &buf[..filled]);
            swarm.behaviour_mut().rr.send_request(
                peer,
                Wire::FileChunk { key: self.my_pub, id, seq, nonce, body },
            );
            seq += 1;
            if filled < FILE_CHUNK {
                break;
            }
        }
        Ok(FileSent { name, size, path: path.to_string_lossy().to_string() })
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
                if self.ensure_writer(id) {
                    if let Some(w) = self.incoming.get_mut(&id) {
                        w.set_meta(name, size, chunks);
                    }
                }
                let _ = swarm.behaviour_mut().rr.send_response(channel, Ack::Ok);
                self.try_finalize(id, peer);
            }

            Wire::FileChunk { key, id, seq, nonce, body } => {
                self.shared.set_key(peer, key);
                if self.ensure_writer(id) {
                    match crypto::open(&self.secret, &PublicKey::from(key), &nonce, &body) {
                        Some(pt) => {
                            if let Some(w) = self.incoming.get_mut(&id) {
                                w.write_chunk(seq, &pt);
                            }
                        }
                        None => eprintln!("[nyx] morceau de fichier de {peer} indéchiffrable"),
                    }
                }
                let _ = swarm.behaviour_mut().rr.send_response(channel, Ack::Ok);
                self.try_finalize(id, peer);
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

            Wire::GroupMsg { key, gid, nonce, body } => {
                self.shared.set_key(peer, key);
                if let Some(pt) = crypto::open(&self.secret, &PublicKey::from(key), &nonce, &body) {
                    if let Ok(text) = String::from_utf8(pt) {
                        let _ = self.app.emit(
                            "group_message",
                            GroupMessage { gid, peer_id: crypto::hex(&key), name: self.shared.peer_name(&peer), text, ts: now_ms() },
                        );
                    }
                }
                let _ = swarm.behaviour_mut().rr.send_response(channel, Ack::Ok);
            }

            Wire::GroupInvite { key, nonce, body } => {
                self.shared.set_key(peer, key);
                if let Some(pt) = crypto::open(&self.secret, &PublicKey::from(key), &nonce, &body) {
                    if let Ok(meta) = ciborium::from_reader::<GroupMeta, _>(&pt[..]) {
                        let _ = self.app.emit(
                            "group_invite",
                            GroupInviteEvent { gid: meta.id, name: meta.name, members: meta.members, from: peer.to_string() },
                        );
                    }
                }
                let _ = swarm.behaviour_mut().rr.send_response(channel, Ack::Ok);
            }

            Wire::GroupLeave { key, gid } => {
                self.shared.set_key(peer, key);
                let _ = self.app.emit("group_leave", GroupLeaveEvent { gid, peer_id: crypto::hex(&key) });
                let _ = swarm.behaviour_mut().rr.send_response(channel, Ack::Ok);
            }
        }
    }

    fn ensure_writer(&mut self, id: u64) -> bool {
        if self.incoming.contains_key(&id) {
            return true;
        }
        match FileWriter::open(&self.download_dir, id) {
            Ok(w) => {
                self.incoming.insert(id, w);
                true
            }
            Err(e) => {
                eprintln!("[nyx] fichier reçu : ouverture impossible : {e}");
                false
            }
        }
    }

    fn try_finalize(&mut self, id: u64, from: PeerId) {
        let done = self.incoming.get(&id).map_or(false, |w| w.is_complete());
        if !done {
            return;
        }
        let writer = self.incoming.remove(&id).unwrap();
        match writer.finalize(&self.download_dir, id) {
            Ok((dest, size, file_name)) => {
                let _ = self.app.emit(
                    "file",
                    ReceivedFile {
                        peer_id: from.to_string(),
                        from_name: self.shared.peer_name(&from),
                        file_name,
                        size,
                        path: dest.to_string_lossy().to_string(),
                        ts: now_ms(),
                    },
                );
            }
            Err(e) => eprintln!("[nyx] écriture du fichier reçu échouée : {e}"),
        }
    }
}

fn read_chunk(file: &mut fs::File, buf: &mut [u8]) -> std::io::Result<usize> {
    use std::io::Read;
    let mut filled = 0;
    while filled < buf.len() {
        match file.read(&mut buf[filled..]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(e) => return Err(e),
        }
    }
    Ok(filled)
}

pub(crate) fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let name = Path::new(name)
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|n| !n.is_empty() && *n != "." && *n != "..")
        .unwrap_or("fichier");
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

pub(crate) fn cleanup_partials(dir: &Path) {
    if let Ok(entries) = fs::read_dir(dir) {
        for e in entries.flatten() {
            let p = e.path();
            let orphan = p
                .file_name()
                .and_then(|n| n.to_str())
                .map_or(false, |n| n.starts_with(".nyx-") && n.ends_with(".part"));
            if orphan {
                let _ = fs::remove_file(p);
            }
        }
    }
}
