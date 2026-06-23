#!/usr/bin/env bash
# Fetch the official Tor Expert Bundle for BOTH macOS architectures
# (x86_64 and aarch64) and lipo them into universal binaries under
# src-tauri/vendor/tor. Used for universal macOS builds so the embedded
# Tor runs natively on Intel and Apple Silicon.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/src-tauri/vendor"
mkdir -p "$VENDOR"

# Latest stable Tor version
VER=$(curl -sL "https://aus1.torproject.org/torbrowser/update_3/release/downloads.json" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])")
echo "Tor version: $VER"

fetch_arch() {
  local arch="$1" dest="$2"
  local url="https://dist.torproject.org/torbrowser/${VER}/tor-expert-bundle-macos-${arch}-${VER}.tar.gz"
  echo "Downloading ($arch): $url"
  mkdir -p "$dest"
  curl -fSL "$url" | tar -xz -C "$dest"
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fetch_arch "x86_64" "$TMP/x86"
fetch_arch "aarch64" "$TMP/arm"

DEST="$VENDOR/tor/tor"
mkdir -p "$DEST"

# Merge every file in the (arm) tor/ directory: Mach-O binaries/dylibs are
# lipo-combined with their x86_64 counterpart, everything else is copied.
shopt -s nullglob
for f in "$TMP/arm/tor/"*; do
  name="$(basename "$f")"
  x86f="$TMP/x86/tor/$name"
  if [ -f "$f" ] && file "$f" | grep -q "Mach-O" && [ -f "$x86f" ]; then
    lipo -create "$f" "$x86f" -output "$DEST/$name"
    echo "lipo -> $name : $(lipo -archs "$DEST/$name")"
  else
    cp -R "$f" "$DEST/$name"
  fi
done

chmod +x "$DEST/tor"

# lipo strips the original code signature, and Apple Silicon refuses to
# execute unsigned Mach-O (the kernel SIGKILLs it), so Tor would never
# start. Re-apply an ad-hoc signature to the dylibs first, then the tor
# binary (inside-out).
for dylib in "$DEST"/*.dylib; do
  [ -f "$dylib" ] && codesign --force --sign - "$dylib"
done
codesign --force --sign - "$DEST/tor"
codesign --verify --verbose "$DEST/tor"

if [ -x "$DEST/tor" ] && lipo -archs "$DEST/tor" | grep -q "x86_64" && lipo -archs "$DEST/tor" | grep -q "arm64"; then
  echo "OK universal tor -> $DEST/tor ($(lipo -archs "$DEST/tor"))"
else
  echo "ERROR: universal tor binary not produced correctly" >&2
  exit 1
fi
