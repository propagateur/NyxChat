//! Intégration Tor.
//!
//! Chaque pair s'expose en service onion : il obtient une adresse `.onion`
//! joignable depuis n'importe où, sans ouvrir de port ni serveur de relais à
//! nous. Pour parler à quelqu'un, on compose son `.onion` via le proxy SOCKS de
//! Tor. C'est le modèle Cwtch/Ricochet.
//!
//! Important : le média des appels (UDP/WebRTC) ne passe PAS par Tor — Tor sert
//! au texte et aux fichiers (TCP, tolérant à la latence).

#![allow(dead_code)] // câblé au transport dans l'incrément suivant

use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpStream;
use tokio::process::{Child, Command};
use tokio::time::timeout;

/// Port "virtuel" du service onion (côté Tor). Il est redirigé vers notre écoute
/// locale en clair sur 127.0.0.1.
pub const VIRTUAL_PORT: u16 = 9001;

pub struct Tor {
    // gardé en vie tant que l'app tourne ; kill_on_drop coupe Tor à la fermeture
    _child: Child,
    pub onion: String,
    pub socks_port: u16,
}

/// Démarre un Tor embarqué et publie un service onion qui redirige
/// `VIRTUAL_PORT` vers `127.0.0.1:local_port`. Renvoie notre adresse `.onion`.
pub async fn start(
    tor_exe: &Path,
    data_dir: &Path,
    local_port: u16,
    socks_port: u16,
) -> Result<Tor, String> {
    let hs_dir = data_dir.join("hs");
    std::fs::create_dir_all(&hs_dir).map_err(|e| e.to_string())?;

    // On construit via std::process pour pouvoir poser CREATE_NO_WINDOW :
    // tor.exe est une appli console, sans ça Windows ouvre une fenêtre cmd.
    let mut std_cmd = std::process::Command::new(tor_exe);
    std_cmd
        .arg("--SocksPort")
        .arg(socks_port.to_string())
        .arg("--DataDirectory")
        .arg(data_dir)
        .arg("--HiddenServiceDir")
        .arg(&hs_dir)
        .arg("--HiddenServicePort")
        .arg(format!("{VIRTUAL_PORT} 127.0.0.1:{local_port}"))
        .arg("--Log")
        .arg("notice stdout")
        .stdout(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std_cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    let mut child = Command::from(std_cmd)
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("lancement de Tor impossible : {e}"))?;

    // Tor peut être lent à s'amorcer : on attend la ligne "Bootstrapped 100%".
    let stdout = child.stdout.take().ok_or("pas de sortie standard de Tor")?;
    let mut lines = BufReader::new(stdout).lines();
    let ready = timeout(Duration::from_secs(120), async {
        while let Ok(Some(line)) = lines.next_line().await {
            if line.contains("Bootstrapped 100%") {
                return true;
            }
        }
        false
    })
    .await
    .map_err(|_| "Tor n'a pas fini de démarrer dans le temps imparti".to_string())?;

    if !ready {
        return Err("Tor s'est arrêté avant d'être prêt".into());
    }

    // Tor écrit l'adresse publique du service dans hs/hostname.
    let onion = std::fs::read_to_string(hs_dir.join("hostname"))
        .map_err(|e| format!("adresse onion introuvable : {e}"))?
        .trim()
        .to_string();

    Ok(Tor { _child: child, onion, socks_port })
}

/// Ouvre une connexion TCP vers `onion` à travers le proxy SOCKS5 de Tor.
/// La résolution du `.onion` est faite par Tor (DNS distant), pas localement.
pub async fn dial(socks_port: u16, onion: &str) -> Result<TcpStream, String> {
    use tokio_socks::tcp::Socks5Stream;
    let target = format!("{onion}:{VIRTUAL_PORT}");
    let stream = Socks5Stream::connect(("127.0.0.1", socks_port), target.as_str())
        .await
        .map_err(|e| format!("connexion via Tor échouée : {e}"))?;
    Ok(stream.into_inner())
}
