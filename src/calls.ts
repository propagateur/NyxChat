export interface TurnConfig {
  url: string;
  username: string;
  credential: string;
}

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

export function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [...DEFAULT_ICE];
  const turn = loadTurn();
  const url = turn.url.trim();
  if (url) {
    servers.push({ urls: url, username: turn.username, credential: turn.credential });
  }
  return servers;
}
