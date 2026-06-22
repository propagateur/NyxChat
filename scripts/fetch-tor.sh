#!/usr/bin/env bash
# Récupère le Tor Expert Bundle officiel pour Linux ou macOS
# et l'extrait dans src-tauri/vendor/tor.
# Le binaire n'est pas versionné (voir .gitignore) ; lance ce script une fois
# avant de builder pour activer le service onion.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/src-tauri/vendor"
mkdir -p "$VENDOR"

# Détecte l'OS et l'architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)  PLATFORM="linux" ;;
  Darwin) PLATFORM="macos" ;;
  *)      echo "OS non supporté : $OS"; exit 1 ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH_SUFFIX="x86_64" ;;
  aarch64|arm64) ARCH_SUFFIX="aarch64" ;;
  *)             echo "Architecture non supportée : $ARCH"; exit 1 ;;
esac

# Récupère la dernière version stable
VER=$(curl -sL "https://aus1.torproject.org/torbrowser/update_3/release/downloads.json" | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])")
echo "Tor version: $VER"

URL="https://dist.torproject.org/torbrowser/${VER}/tor-expert-bundle-${PLATFORM}-${ARCH_SUFFIX}-${VER}.tar.gz"
TGZ="$VENDOR/teb.tar.gz"

echo "Téléchargement : $URL"
curl -fSL -o "$TGZ" "$URL"

DEST="$VENDOR/tor"
mkdir -p "$DEST"
tar -xzf "$TGZ" -C "$DEST"
rm -f "$TGZ"

TOR_BIN="$DEST/tor/tor"
if [ -x "$TOR_BIN" ]; then
  echo "OK -> $TOR_BIN"
else
  echo "ERREUR : binaire tor introuvable après extraction" >&2
  exit 1
fi
