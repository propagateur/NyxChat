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
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpStream;
use tokio::process::{Child, Command};
use tokio::time::sleep;

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

    // Tor refuses a HiddenServiceDir whose permissions are group/world
    // accessible (and warns on the DataDirectory). create_dir_all leaves 0755
    // on Unix, so without this Tor never publishes the onion service and no
    // .onion address is produced — this is why it failed on macOS/Linux but
    // not on Windows (which has no such check).
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let private = std::fs::Permissions::from_mode(0o700);
        let _ = std::fs::set_permissions(data_dir, private.clone());
        std::fs::set_permissions(&hs_dir, private).map_err(|e| e.to_string())?;
    }

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
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std_cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    let mut child = Command::from(std_cmd)
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("could not launch Tor: {e}"))?;

    // Continuously drain stdout AND stderr into a small ring buffer. This both
    // keeps Tor from blocking on a full pipe (which would freeze it) and gives
    // us its recent output to report if startup fails.
    let log: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    if let Some(out) = child.stdout.take() {
        drain(out, log.clone());
    }
    if let Some(err) = child.stderr.take() {
        drain(err, log.clone());
    }

    // Ready means two things: we know our onion address (Tor writes it to
    // hs/hostname early) AND Tor has actually bootstrapped — otherwise it can
    // neither reach peers nor publish our hidden service, even though the
    // address already exists (it persists across runs). We scan the drained
    // log buffer for "Bootstrapped 100%": reliable now that both streams are
    // continuously drained, unlike reading the raw pipe directly.
    let hostname_path = hs_dir.join("hostname");
    let deadline = Instant::now() + Duration::from_secs(120);
    let mut onion = String::new();
    loop {
        if onion.is_empty() {
            if let Ok(s) = std::fs::read_to_string(&hostname_path) {
                let s = s.trim().to_string();
                if !s.is_empty() {
                    onion = s;
                }
            }
        }
        let bootstrapped = {
            let g = log.lock().unwrap();
            g.iter().any(|l| l.contains("Bootstrapped 100%"))
        };
        if bootstrapped && !onion.is_empty() {
            return Ok(Tor { _child: child, onion, socks_port });
        }
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!("Tor exited early ({status}). {}", recent(&log)));
        }
        if Instant::now() >= deadline {
            return Err(format!("Tor didn't finish bootstrapping in time. {}", recent(&log)));
        }
        sleep(Duration::from_millis(300)).await;
    }
}

/// Spawn a task that reads a child stream line by line into a capped ring buffer.
fn drain<R>(stream: R, log: Arc<Mutex<Vec<String>>>)
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let mut lines = BufReader::new(stream).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let mut g = log.lock().unwrap();
            g.push(line);
            let n = g.len();
            if n > 80 {
                g.drain(0..n - 80);
            }
        }
    });
}

/// The last few captured Tor output lines, for error messages.
fn recent(log: &Arc<Mutex<Vec<String>>>) -> String {
    let g = log.lock().unwrap();
    let start = g.len().saturating_sub(8);
    g[start..].join(" | ")
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
