#![allow(dead_code)]

use std::path::Path;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpStream;
use tokio::process::{Child, Command};
use tokio::time::sleep;

pub const VIRTUAL_PORT: u16 = 9001;

pub struct Tor {
    _child: Child,
    pub onion: String,
    pub socks_port: u16,
}

pub async fn start(
    tor_exe: &Path,
    data_dir: &Path,
    local_port: u16,
    socks_port: u16,
) -> Result<Tor, String> {
    let hs_dir = data_dir.join("hs");
    std::fs::create_dir_all(&hs_dir).map_err(|e| e.to_string())?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let private = std::fs::Permissions::from_mode(0o700);
        let _ = std::fs::set_permissions(data_dir, private.clone());
        std::fs::set_permissions(&hs_dir, private).map_err(|e| e.to_string())?;
    }

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

    if let Some(base) = tor_exe.parent().and_then(|p| p.parent()) {
        let geoip = base.join("data").join("geoip");
        let geoip6 = base.join("data").join("geoip6");
        if geoip.exists() {
            std_cmd.arg("--GeoIPFile").arg(&geoip);
        }
        if geoip6.exists() {
            std_cmd.arg("--GeoIPv6File").arg(&geoip6);
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std_cmd.creation_flags(0x0800_0000);
    }

    let mut child = Command::from(std_cmd)
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("could not launch Tor: {e}"))?;

    let log: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    if let Some(out) = child.stdout.take() {
        drain(out, log.clone());
    }
    if let Some(err) = child.stderr.take() {
        drain(err, log.clone());
    }

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

fn recent(log: &Arc<Mutex<Vec<String>>>) -> String {
    let g = log.lock().unwrap();
    let start = g.len().saturating_sub(8);
    g[start..].join(" | ")
}

pub async fn dial(socks_port: u16, onion: &str) -> Result<TcpStream, String> {
    use tokio_socks::tcp::Socks5Stream;
    let target = format!("{onion}:{VIRTUAL_PORT}");
    let stream = Socks5Stream::connect(("127.0.0.1", socks_port), target.as_str())
        .await
        .map_err(|e| format!("connexion via Tor échouée : {e}"))?;
    Ok(stream.into_inner())
}
