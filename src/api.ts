import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type {
  FileSent,
  GroupInvite,
  GroupLeave,
  GroupMessage,
  Identity,
  IncomingMessage,
  Peer,
  ReceivedFile,
} from "./types";

export const getIdentity = () => invoke<Identity>("get_identity");
export const listPeers = () => invoke<Peer[]>("list_peers");
export const sendMessage = (peerId: string, text: string) =>
  invoke<void>("send_message", { peerId, text });
export const sendFile = (peerId: string, path: string) =>
  invoke<FileSent>("send_file", { peerId, path });
export const sendVoice = (peerId: string, bytes: number[], ext: string) =>
  invoke<FileSent>("send_voice", { peerId, bytes, ext });
export const setName = (name: string) => invoke<void>("set_name", { name });
export const connectOnion = (onion: string) => invoke<void>("connect_onion", { onion });
export const openPath = (target: string) => invoke<void>("open_path", { target });

export const sendGroup = (gid: string, text: string, members: string[]) =>
  invoke<void>("send_group", { gid, text, members });
export const sendInvite = (memberKey: string, gid: string, name: string, members: string[]) =>
  invoke<void>("send_invite", { memberKey, gid, name, members });
export const groupLeaveCmd = (gid: string, members: string[]) =>
  invoke<void>("group_leave", { gid, members });

export const onGroupMessage = (cb: (m: GroupMessage) => void): Promise<UnlistenFn> =>
  listen<GroupMessage>("group_message", (e) => cb(e.payload));
export const onGroupInvite = (cb: (g: GroupInvite) => void): Promise<UnlistenFn> =>
  listen<GroupInvite>("group_invite", (e) => cb(e.payload));
export const onGroupLeave = (cb: (g: GroupLeave) => void): Promise<UnlistenFn> =>
  listen<GroupLeave>("group_leave", (e) => cb(e.payload));

export async function pickFile(): Promise<string | null> {
  const sel = await open({ multiple: false, directory: false });
  return typeof sel === "string" ? sel : null;
}

export async function pickSave(defaultName: string): Promise<string | null> {
  const sel = await save({ defaultPath: defaultName });
  return sel ?? null;
}

export const exportIdentity = (dest: string) => invoke<void>("export_identity", { dest });
export const importIdentity = (src: string) => invoke<void>("import_identity", { src });

export const onPeers = (cb: (peers: Peer[]) => void): Promise<UnlistenFn> =>
  listen<Peer[]>("peers", (e) => cb(e.payload));

export const onIdentity = (cb: (id: Identity) => void): Promise<UnlistenFn> =>
  listen<Identity>("identity", (e) => cb(e.payload));

export const onTorError = (cb: (msg: string) => void): Promise<UnlistenFn> =>
  listen<string>("tor_error", (e) => cb(e.payload));

export const onConnectError = (cb: (msg: string) => void): Promise<UnlistenFn> =>
  listen<string>("connect_error", (e) => cb(e.payload));

export const onMessage = (cb: (msg: IncomingMessage) => void): Promise<UnlistenFn> =>
  listen<IncomingMessage>("message", (e) => cb(e.payload));

export const onFile = (cb: (file: ReceivedFile) => void): Promise<UnlistenFn> =>
  listen<ReceivedFile>("file", (e) => cb(e.payload));

export const sendSignal = (peerId: string, data: string) =>
  invoke<void>("signal", { peerId, data });

export const onSignal = (
  cb: (msg: { peer_id: string; data: string }) => void
): Promise<UnlistenFn> =>
  listen<{ peer_id: string; data: string }>("signal", (e) => cb(e.payload));

export async function notify(title: string, body: string) {
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (granted) sendNotification({ title, body });
  } catch (e) {
    console.error("notify:", e);
  }
}
