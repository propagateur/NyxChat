// Fine couche au-dessus des commandes/events Tauri. Tout ce qui touche au
// backend Rust passe par ici, le reste de l'UI reste agnostique.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { FileSent, Identity, IncomingMessage, Peer, ReceivedFile } from "./types";

export const getIdentity = () => invoke<Identity>("get_identity");
export const listPeers = () => invoke<Peer[]>("list_peers");
export const sendMessage = (peerId: string, text: string) =>
  invoke<void>("send_message", { peerId, text });
export const sendFile = (peerId: string, path: string) =>
  invoke<FileSent>("send_file", { peerId, path });
export const sendVoice = (peerId: string, bytes: number[], ext: string) =>
  invoke<FileSent>("send_voice", { peerId, bytes, ext });
export const setName = (name: string) => invoke<void>("set_name", { name });
// Se connecter à un pair par son adresse .onion (via Tor).
export const connectOnion = (onion: string) => invoke<void>("connect_onion", { onion });

// Sélecteur de fichier natif. Renvoie le chemin choisi, ou null si annulé.
export async function pickFile(): Promise<string | null> {
  const sel = await open({ multiple: false, directory: false });
  return typeof sel === "string" ? sel : null;
}

export const onPeers = (cb: (peers: Peer[]) => void): Promise<UnlistenFn> =>
  listen<Peer[]>("peers", (e) => cb(e.payload));

// Émis quand Tor a démarré et que l'adresse .onion est disponible.
export const onIdentity = (cb: (id: Identity) => void): Promise<UnlistenFn> =>
  listen<Identity>("identity", (e) => cb(e.payload));

// Émis si Tor échoue à démarrer (binaire manquant, port, bootstrap...).
export const onTorError = (cb: (msg: string) => void): Promise<UnlistenFn> =>
  listen<string>("tor_error", (e) => cb(e.payload));

// Émis quand la connexion à l'adresse onion d'un pair finit par échouer.
export const onConnectError = (cb: (msg: string) => void): Promise<UnlistenFn> =>
  listen<string>("connect_error", (e) => cb(e.payload));

export const onMessage = (cb: (msg: IncomingMessage) => void): Promise<UnlistenFn> =>
  listen<IncomingMessage>("message", (e) => cb(e.payload));

export const onFile = (cb: (file: ReceivedFile) => void): Promise<UnlistenFn> =>
  listen<ReceivedFile>("file", (e) => cb(e.payload));

// Signalisation WebRTC : on relaie des blobs JSON opaques (offre/réponse/ICE).
export const sendSignal = (peerId: string, data: string) =>
  invoke<void>("signal", { peerId, data });

export const onSignal = (
  cb: (msg: { peer_id: string; data: string }) => void
): Promise<UnlistenFn> =>
  listen<{ peer_id: string; data: string }>("signal", (e) => cb(e.payload));

// Notification système (si l'utilisateur l'a autorisée).
export async function notify(title: string, body: string) {
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (granted) sendNotification({ title, body });
  } catch (e) {
    console.error("notify:", e);
  }
}
