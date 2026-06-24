export type View = "home" | "messages" | "network" | "settings";
export type Accent = "lune" | "or" | "iris" | "rose";

export interface Identity {
  peer_id: string;
  key: string;
  name: string;
  fingerprint: string;
  onion: string;
}

export interface Peer {
  peer_id: string;
  key: string | null;
  name: string | null;
  fingerprint: string | null;
  online: boolean;
  transport: "lan" | "tor";
}

export interface IncomingMessage {
  peer_id: string;
  name: string | null;
  text: string;
  ts: number;
}

export interface FileSent {
  name: string;
  size: number;
  path: string;
}

export interface ReceivedFile {
  peer_id: string;
  from_name: string | null;
  file_name: string;
  size: number;
  path: string;
  ts: number;
}

export interface FileRef {
  name: string;
  size: number;
  path?: string;
}

export interface ChatMessage {
  text: string;
  ts: number;
  outgoing: boolean;
  failed?: boolean;
  file?: FileRef;
  from?: string;
}

export interface Group {
  id: string;
  name: string;
  members: string[];
  owner: boolean;
}

export interface GroupMessage {
  gid: string;
  peer_id: string;
  name: string | null;
  text: string;
  ts: number;
}
export interface GroupInvite {
  gid: string;
  name: string;
  members: string[];
  from: string;
}
export interface GroupLeave {
  gid: string;
  peer_id: string;
}
