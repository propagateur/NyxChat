# Récupère le Tor Expert Bundle officiel et l'extrait dans src-tauri/vendor/tor.
# Le binaire n'est pas versionné (voir .gitignore) ; lance ce script une fois
# avant de builder pour activer le service onion.
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $PSScriptRoot
$vendor = Join-Path $root "src-tauri\vendor"
New-Item -ItemType Directory -Force -Path $vendor | Out-Null

$ver = (Invoke-RestMethod "https://aus1.torproject.org/torbrowser/update_3/release/downloads.json").version
Write-Host "Tor version: $ver"

$url = "https://dist.torproject.org/torbrowser/$ver/tor-expert-bundle-windows-x86_64-$ver.tar.gz"
$tgz = Join-Path $vendor "teb.tar.gz"
Invoke-WebRequest -Uri $url -OutFile $tgz

$dest = Join-Path $vendor "tor"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
tar -xzf $tgz -C $dest
Remove-Item $tgz

$exe = Join-Path $dest "tor\tor.exe"
if (Test-Path $exe) { Write-Host "OK -> $exe" } else { throw "tor.exe introuvable apres extraction" }
