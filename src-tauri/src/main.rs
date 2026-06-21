// Pas de console qui s'ouvre en release sous Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod crypto;
mod net;

use std::sync::Arc;

use net::{Command, FileSent, Identity, PeerView, Shared};
use tauri::{Manager, State};
use tokio::sync::{mpsc, oneshot};

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
    tx: State<'_, mpsc::Sender<Command>>,
) -> Result<(), String> {
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
    tx: State<'_, mpsc::Sender<Command>>,
) -> Result<FileSent, String> {
    let peer = peer_id.parse().map_err(|_| "identifiant de pair invalide".to_string())?;
    let (reply, rx) = oneshot::channel();
    tx.send(Command::SendFile { peer, path: path.into(), reply })
        .await
        .map_err(|_| "réseau indisponible".to_string())?;
    rx.await.map_err(|_| "pas de réponse du réseau".to_string())?
}

#[tauri::command]
async fn signal(
    peer_id: String,
    data: String,
    tx: State<'_, mpsc::Sender<Command>>,
) -> Result<(), String> {
    let peer = peer_id.parse().map_err(|_| "identifiant de pair invalide".to_string())?;
    tx.send(Command::Signal { peer, data })
        .await
        .map_err(|_| "réseau indisponible".to_string())?;
    Ok(())
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
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir).ok();
            // Les fichiers reçus atterrissent dans Téléchargements (sinon le dossier app).
            let download_dir = app.path().download_dir().unwrap_or_else(|_| dir.clone());

            let (id_keys, secret) = net::load_or_create_identity(&dir);
            let my_pub: [u8; 32] = *secret.public_key().as_bytes();
            let identity = Identity {
                peer_id: id_keys.public().to_peer_id().to_string(),
                name: net::load_name(&dir),
                fingerprint: crypto::fingerprint(&my_pub),
            };

            let shared = Arc::new(Shared::new(identity, dir));
            let (cmd_tx, cmd_rx) = mpsc::channel::<Command>(64);

            app.manage(shared.clone());
            app.manage(cmd_tx);

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(net::run(id_keys, secret, shared, handle, cmd_rx, download_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_identity,
            list_peers,
            send_message,
            send_file,
            signal,
            set_name
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de NyxChat");
}
