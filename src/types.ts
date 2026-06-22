export type View = "home" | "messages" | "network" | "settings";
export type Accent = "lune" | "or" | "iris" | "rose";

export interface Identity {
  peer_id: string;
  name: string;
  fingerprint: string;
  onion: string; // adresse .onion (vide tant que Tor démarre)
}

export interface Peer {
  peer_id: string;
  name: string | null;
  fingerprint: string | null;
  online: boolean;
  transport: "lan" | "tor";
}

// Ce que le backend nous pousse quand un message arrive.
export interface IncomingMessage {
  peer_id: string;
  name: string | null;
  text: string;
  ts: number;
}

// Confirmation d'envoi d'un fichier (retour de la commande send_file).
export interface FileSent {
  name: string;
  size: number;
  path: string;
}

// Event "file" : un fichier reçu et enregistré sur le disque.
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
  path?: string; // côté reçu uniquement : où il a été enregistré
}

// Ce qu'on garde côté UI pour afficher une conversation.
export interface ChatMessage {
  text: string;
  ts: number;
  outgoing: boolean;
  failed?: boolean;
  file?: FileRef;
}
