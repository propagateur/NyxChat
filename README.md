# NyxChat

**NyxChat is a desktop peer-to-peer messenger with end-to-end encryption, local discovery, and Tor onion reachability.**

NyxChat does not rely on a central account server. Each device owns its local identity, peers can discover each other on the same network, and remote contacts can connect through shared `.onion` addresses. Messages and files are encrypted before they leave the device.

Built with Tauri, Rust, React, TypeScript, libp2p, Tor, and WebRTC.

## Features

- End-to-end encrypted messages with X25519 and XSalsa20-Poly1305
- Automatic local peer discovery with mDNS and libp2p
- Remote reachability through Tor onion services
- Encrypted group conversations, with invitations and membership synced peer-to-peer (no server)
- QR-based address sharing
- Encrypted file transfer with image previews
- Voice messages
- Audio and video calls with encrypted signaling, and a minimizable call window so you can keep chatting
- Fingerprint-based identity verification, bound to the exact key
- Identity backup and restore — your account is a file you own
- Four interface styles (Nocturne, Terminal, Aurore, Brume), light and dark, with accent colors
- Interface in nine languages (English, French, Spanish, German, Italian, Portuguese, Dutch, Polish, Russian)
- Command palette, emoji picker, drag and drop, clickable links, and lightweight Markdown
- Pinned, muted, and verified conversations
- System tray support
- No conversation history written to disk by default

## How It Works

NyxChat uses a Rust backend for networking and cryptography, exposed to the React interface through Tauri commands and events.

```text
Rust / Tauri backend                 React / TypeScript interface
net.rs      libp2p swarm             Home, Messages, Network, Settings
tornet.rs   Tor onion transport      Chat, calls, QR, command palette
crypto.rs   content encryption       api.ts invoke/listen bridge
```

Each peer has a libp2p identity for transport and an X25519 key pair for message encryption. After peers exchange public encryption keys, every message is sealed for its recipient. File transfers use the same encrypted channel and are split into encrypted chunks.

Calls use the WebRTC engine provided by the webview. Audio and video media flow directly between peers when possible, while SDP and ICE signaling travel through the encrypted messaging channel.

The fingerprint displayed for each peer is derived from the public encryption key. Comparing it through a trusted side channel helps confirm that both sides are talking to the expected device.

## Network Modes

- **Local network:** peers discover each other automatically with mDNS and connect directly.
- **Internet:** peers exchange `.onion` addresses and connect through Tor onion services without opening ports.
- **Groups:** a group message is sealed individually for each member and routed over whichever transport reaches them. Members are identified by their encryption key, so groups work across both local and Tor links.
- **Calls:** WebRTC calls are designed for local networks and common NAT traversal through STUN, with a bundled free relay as a fallback. Media does not travel through Tor.

## Security Notes

NyxChat uses established cryptographic primitives, but it has not received a formal third-party security audit. Treat it as an experimental private messenger, not as a tool for protecting high-risk secrets.

## Development

Requirements:

- Node.js 18 or newer
- Rust stable
- Windows, macOS, or Linux with the native dependencies required by Tauri

```bash
# Install frontend dependencies
npm install

# Fetch the embedded Tor bundle on Windows
powershell -ExecutionPolicy Bypass -File scripts/fetch-tor.ps1

# Run the desktop app in development
npm run tauri dev

# Build the frontend
npm run build

# Build native installers
npm run tauri build
```

The first native build can take several minutes because the Rust networking stack is compiled locally. To test peer-to-peer behavior, run NyxChat on two devices on the same local network or exchange onion addresses between remote devices.

## Release Builds

The GitHub Actions workflow builds Windows, a universal macOS (Intel + Apple Silicon) `.dmg`, and Linux (`.deb` / `.rpm`) artifacts when a version tag is pushed.

```bash
git tag v1.0.0
git push origin v1.0.0
```

### macOS first launch

The macOS build is not signed with an Apple Developer ID, so Gatekeeper may report *"NyxChat is damaged and can't be opened"* after download. This is the quarantine flag, not actual corruption. Move NyxChat to Applications and run once:

```bash
xattr -dr com.apple.quarantine /Applications/NyxChat.app
```

## License

MIT. See [LICENSE](LICENSE).
