#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod crypto;
mod net;
mod tor;
mod tornet;

use std::path::PathBuf;
use std::sync::Arc;

use libp2p::PeerId;
use net::{Command, FileSent, Identity, PeerView, Shared};
use tauri::{Manager, State};
use tokio::sync::{mpsc, oneshot};
use tornet::TorCmd;

#[tauri::command]
fn get_identity(shared: State<'_, Arc<Shared>>) -> Identity {
    shared.me.lock().unwrap().clone()
}

#[tauri::command]
fn list_peers(shared: State<'_, Arc<Shared>>) -> Vec<PeerView> {
    shared.peer_list()
}

#[tauri::command]
async fn send_message(
    peer_id: String,
    text: String,
    shared: State<'_, Arc<Shared>>,
    tx: State<'_, mpsc::Sender<Command>>,
    tor: State<'_, mpsc::Sender<TorCmd>>,
) -> Result<(), String> {
    if shared.is_tor_peer(&peer_id) {
        return tor
            .send(TorCmd::SendText { id: peer_id, text })
            .await
            .map_err(|_| "réseau Tor indisponible".to_string());
    }
    let peer = peer_id.parse().map_err(|_| "identifiant de pair invalide".to_string())?;
    let (reply, rx) = oneshot::channel();
    tx.send(Command::Send { peer, text, reply })
        .await
        .map_err(|_| "réseau indisponible".to_string())?;
    rx.await.map_err(|_| "pas de réponse du réseau".to_string())?
}

#[tauri::command]
async fn send_file(
    peer_id: String,
    path: String,
    shared: State<'_, Arc<Shared>>,
    tx: State<'_, mpsc::Sender<Command>>,
    tor: State<'_, mpsc::Sender<TorCmd>>,
) -> Result<FileSent, String> {
    let (reply, rx) = oneshot::channel();
    if shared.is_tor_peer(&peer_id) {
        tor.send(TorCmd::SendFile { id: peer_id, path: path.into(), reply })
            .await
            .map_err(|_| "réseau Tor indisponible".to_string())?;
        return rx.await.map_err(|_| "pas de réponse du réseau".to_string())?;
    }
    let peer = peer_id.parse().map_err(|_| "identifiant de pair invalide".to_string())?;
    tx.send(Command::SendFile { peer, path: path.into(), reply })
        .await
        .map_err(|_| "réseau indisponible".to_string())?;
    rx.await.map_err(|_| "pas de réponse du réseau".to_string())?
}

#[tauri::command]
async fn send_voice(
    peer_id: String,
    bytes: Vec<u8>,
    ext: String,
    shared: State<'_, Arc<Shared>>,
    tx: State<'_, mpsc::Sender<Command>>,
    tor: State<'_, mpsc::Sender<TorCmd>>,
) -> Result<FileSent, String> {
    let safe: String = ext.chars().filter(|c| c.is_ascii_alphanumeric()).take(5).collect();
    let name = format!("message-vocal-{}.{}", rand::random::<u64>(), if safe.is_empty() { "webm".to_string() } else { safe });
    let path = std::env::temp_dir().join(&name);
    std::fs::write(&path, &bytes).map_err(|e| format!("écriture impossible : {e}"))?;

    let (reply, rx) = oneshot::channel();
    let res = if shared.is_tor_peer(&peer_id) {
        tor.send(TorCmd::SendFile { id: peer_id, path: path.clone(), reply })
            .await
            .map_err(|_| "réseau Tor indisponible".to_string())?;
        rx.await.map_err(|_| "pas de réponse du réseau".to_string())?
    } else {
        let peer = peer_id.parse().map_err(|_| "identifiant de pair invalide".to_string())?;
        tx.send(Command::SendFile { peer, path: path.clone(), reply })
            .await
            .map_err(|_| "réseau indisponible".to_string())?;
        rx.await.map_err(|_| "pas de réponse du réseau".to_string())?
    };
    let _ = std::fs::remove_file(&path);
    res
}

async fn route_tor(
    shared: &Arc<Shared>,
    tor: &mpsc::Sender<TorCmd>,
    tx: &mpsc::Sender<Command>,
    key: &str,
    to_tor: impl FnOnce(String) -> TorCmd,
    to_lan: impl FnOnce(PeerId) -> Command,
) {
    if shared.is_tor_peer(key) {
        let _ = tor.send(to_tor(key.to_string())).await;
    } else if let Some(peer) = shared.lan_peer_by_key(key) {
        let _ = tx.send(to_lan(peer)).await;
    }
}

#[tauri::command]
async fn send_group(
    gid: String,
    text: String,
    members: Vec<String>,
    shared: State<'_, Arc<Shared>>,
    tx: State<'_, mpsc::Sender<Command>>,
    tor: State<'_, mpsc::Sender<TorCmd>>,
) -> Result<(), String> {
    for key in members {
        route_tor(
            &shared,
            &tor,
            &tx,
            &key,
            |id| TorCmd::GroupMsg { id, gid: gid.clone(), text: text.clone() },
            |peer| Command::GroupMsg { peer, gid: gid.clone(), text: text.clone() },
        )
        .await;
    }
    Ok(())
}

#[tauri::command]
async fn send_invite(
    member_key: String,
    gid: String,
    name: String,
    members: Vec<String>,
    shared: State<'_, Arc<Shared>>,
    tx: State<'_, mpsc::Sender<Command>>,
    tor: State<'_, mpsc::Sender<TorCmd>>,
) -> Result<(), String> {
    route_tor(
        &shared,
        &tor,
        &tx,
        &member_key,
        |id| TorCmd::GroupInvite { id, gid: gid.clone(), name: name.clone(), members: members.clone() },
        |peer| Command::GroupInvite { peer, gid: gid.clone(), name: name.clone(), members: members.clone() },
    )
    .await;
    Ok(())
}

#[tauri::command]
async fn group_leave(
    gid: String,
    members: Vec<String>,
    shared: State<'_, Arc<Shared>>,
    tx: State<'_, mpsc::Sender<Command>>,
    tor: State<'_, mpsc::Sender<TorCmd>>,
) -> Result<(), String> {
    for key in members {
        route_tor(
            &shared,
            &tor,
            &tx,
            &key,
            |id| TorCmd::GroupLeave { id, gid: gid.clone() },
            |peer| Command::GroupLeave { peer, gid: gid.clone() },
        )
        .await;
    }
    Ok(())
}

#[tauri::command]
fn open_path(target: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let spawned = std::process::Command::new("explorer").arg(&target).spawn();
    #[cfg(target_os = "macos")]
    let spawned = std::process::Command::new("open").arg(&target).spawn();
    #[cfg(target_os = "linux")]
    let spawned = std::process::Command::new("xdg-open").arg(&target).spawn();
    spawned.map(|_| ()).map_err(|e| e.to_string())
}

fn hex_bytes(b: &[u8]) -> String {
    let mut s = String::with_capacity(b.len() * 2);
    for x in b {
        s.push_str(&format!("{x:02x}"));
    }
    s
}

fn unhex(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok()).collect()
}

#[tauri::command]
fn export_identity(dest: String, app: tauri::AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let identity = std::fs::read(dir.join("identity.key")).map_err(|_| "identité introuvable".to_string())?;
    let e2e = std::fs::read(dir.join("e2e.key")).map_err(|_| "clé de chiffrement introuvable".to_string())?;
    let name = std::fs::read_to_string(dir.join("name.txt")).unwrap_or_default();
    let out = format!(
        "NYXCHAT-BACKUP-1\nidentity:{}\ne2e:{}\nname:{}\n",
        hex_bytes(&identity),
        hex_bytes(&e2e),
        name.trim()
    );
    std::fs::write(&dest, out).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn import_identity(src: String, app: tauri::AppHandle) -> Result<(), String> {
    let content = std::fs::read_to_string(&src).map_err(|e| e.to_string())?;
    let mut identity: Option<Vec<u8>> = None;
    let mut e2e: Option<Vec<u8>> = None;
    let mut name = String::new();
    for line in content.lines() {
        if let Some(v) = line.strip_prefix("identity:") {
            identity = unhex(v.trim());
        } else if let Some(v) = line.strip_prefix("e2e:") {
            e2e = unhex(v.trim());
        } else if let Some(v) = line.strip_prefix("name:") {
            name = v.trim().to_string();
        }
    }
    let identity = identity.filter(|b| !b.is_empty()).ok_or("sauvegarde invalide")?;
    let e2e = e2e.filter(|b| b.len() == 32).ok_or("sauvegarde invalide")?;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).ok();
    std::fs::write(dir.join("identity.key"), &identity).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("e2e.key"), &e2e).map_err(|e| e.to_string())?;
    if !name.is_empty() {
        let _ = std::fs::write(dir.join("name.txt"), &name);
    }
    Ok(())
}

#[tauri::command]
async fn signal(
    peer_id: String,
    data: String,
    shared: State<'_, Arc<Shared>>,
    tx: State<'_, mpsc::Sender<Command>>,
    tor: State<'_, mpsc::Sender<TorCmd>>,
) -> Result<(), String> {
    if shared.is_tor_peer(&peer_id) {
        return tor
            .send(TorCmd::Signal { id: peer_id, data })
            .await
            .map_err(|_| "réseau Tor indisponible".to_string());
    }
    let peer = peer_id.parse().map_err(|_| "identifiant de pair invalide".to_string())?;
    tx.send(Command::Signal { peer, data })
        .await
        .map_err(|_| "réseau indisponible".to_string())?;
    Ok(())
}

#[tauri::command]
async fn connect_onion(onion: String, tor: State<'_, mpsc::Sender<TorCmd>>) -> Result<(), String> {
    let onion = onion.trim().trim_end_matches('/').to_string();
    if !onion.ends_with(".onion") {
        return Err("adresse .onion invalide".into());
    }
    tor.send(TorCmd::Connect(onion))
        .await
        .map_err(|_| "réseau Tor indisponible".to_string())
}

#[tauri::command]
async fn set_name(
    name: String,
    shared: State<'_, Arc<Shared>>,
    tx: State<'_, mpsc::Sender<Command>>,
) -> Result<(), String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("le nom ne peut pas être vide".into());
    }
    shared.me.lock().unwrap().name = name.clone();
    shared.save_name(&name);
    let _ = tx.send(Command::Broadcast(name)).await;
    Ok(())
}

fn main() {
    #[cfg(target_os = "linux")]
    {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir).ok();
            let download_dir = app.path().download_dir().unwrap_or_else(|_| dir.clone());
            let tor_data = dir.join("tor");

            let (id_keys, secret) = net::load_or_create_identity(&dir);
            let my_pub: [u8; 32] = *secret.public_key().as_bytes();
            let identity = Identity {
                peer_id: id_keys.public().to_peer_id().to_string(),
                key: crypto::hex(&my_pub),
                name: net::load_name(&dir),
                fingerprint: crypto::fingerprint(&my_pub),
                onion: String::new(),
            };

            let shared = Arc::new(Shared::new(identity, dir));
            let (cmd_tx, cmd_rx) = mpsc::channel::<Command>(64);
            let (tor_tx, tor_rx) = mpsc::channel::<TorCmd>(64);

            app.manage(shared.clone());
            app.manage(cmd_tx);
            app.manage(tor_tx);

            let tor_secret = Arc::new(crypto_box::SecretKey::from(secret.to_bytes()));
            let tor_rel = if cfg!(windows) {
                "vendor/tor/tor/tor.exe"
            } else {
                "vendor/tor/tor/tor"
            };
            let tor_exe = app
                .path()
                .resolve(tor_rel, tauri::path::BaseDirectory::Resource)
                .ok()
                .filter(|p| p.exists())
                .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(tor_rel));
            tauri::async_runtime::spawn(tornet::start(
                app.handle().clone(),
                shared.clone(),
                tor_secret,
                my_pub,
                download_dir.clone(),
                tor_exe,
                tor_data,
                tor_rx,
            ));

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(net::run(id_keys, secret, shared, handle, cmd_rx, download_dir));

            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
            let show_i = MenuItem::with_id(app, "show", "Ouvrir NyxChat", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("NyxChat")
                .menu(&menu)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_identity,
            list_peers,
            send_message,
            send_file,
            send_voice,
            signal,
            connect_onion,
            set_name,
            send_group,
            send_invite,
            group_leave,
            open_path,
            export_identity,
            import_identity
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de NyxChat");
}
