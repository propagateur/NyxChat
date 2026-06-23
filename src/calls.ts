// Call configuration: STUN is always used to discover public addresses and
// traverse common NATs. A TURN server is optional but required when both
// peers sit behind strict/symmetric NATs (or only reach each other over Tor,
// since WebRTC media cannot flow through Tor) — TURN then relays the media.
// The user supplies their own TURN server in Settings.

export interface TurnConfig {
  url: string;
  username: string;
  credential: string;
}

const EMPTY: TurnConfig = { url: "", username: "", credential: "" };

export function loadTurn(): TurnConfig {
  try {
    const raw = localStorage.getItem("nyx.turn");
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return {
      url: typeof parsed.url === "string" ? parsed.url : "",
      username: typeof parsed.username === "string" ? parsed.username : "",
      credential: typeof parsed.credential === "string" ? parsed.credential : "",
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveTurn(c: TurnConfig) {
  localStorage.setItem("nyx.turn", JSON.stringify(c));
}

// Built fresh for each call so a TURN server added in Settings takes effect
// without restarting the app.
export function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  const turn = loadTurn();
  const url = turn.url.trim();
  if (url) {
    servers.push({ urls: url, username: turn.username, credential: turn.credential });
  }
  return servers;
}
