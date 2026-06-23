// Call configuration: STUN is always used to discover public addresses and
// traverse common NATs. A TURN server relays the media when both peers sit
// behind strict/symmetric NATs (or only reach each other over Tor, since
// WebRTC media cannot flow through Tor).
//
// A free public TURN (Metered's Open Relay Project) is bundled so calls work
// out of the box with no setup. It is best-effort (shared, rate-limited); a
// user can override it with their own TURN server in Settings for reliability.

export interface TurnConfig {
  url: string;
  username: string;
  credential: string;
}

// Always-on defaults so a fresh install can connect without any configuration.
const DEFAULT_ICE: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: "stun:stun.relay.metered.ca:80" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

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
// without restarting the app. The user's own TURN (if set) is added on top of
// the bundled defaults; ICE tries all of them and picks whatever connects.
export function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [...DEFAULT_ICE];
  const turn = loadTurn();
  const url = turn.url.trim();
  if (url) {
    servers.push({ urls: url, username: turn.username, credential: turn.credential });
  }
  return servers;
}
