import { useEffect, useMemo, useState } from "react";
import {
  connectOnion,
  getIdentity,
  listPeers,
  onFile,
  onIdentity,
  onMessage,
  onPeers,
  pickFile,
  sendFile,
  sendMessage,
  setName,
} from "./api";
import type { ChatMessage, Identity, Peer } from "./types";
import { useCall } from "./useCall";
import Sidebar from "./components/Sidebar";
import Chat from "./components/Chat";
import Call from "./components/Call";

export default function App() {
  const [me, setMe] = useState<Identity | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});
  const [active, setActive] = useState<string | null>(null);
  const { call, startCall, acceptCall, hangup, toggleMute, toggleCam } = useCall();

  useEffect(() => {
    getIdentity().then(setMe).catch(console.error);
    listPeers().then(setPeers).catch(console.error);

    const unIdentity = onIdentity(setMe);
    const unPeers = onPeers(setPeers);
    const unMsg = onMessage((m) => {
      setThreads((t) => append(t, m.peer_id, { text: m.text, ts: m.ts, outgoing: false }));
    });
    const unFile = onFile((f) => {
      setThreads((t) =>
        append(t, f.peer_id, {
          text: "",
          ts: f.ts,
          outgoing: false,
          file: { name: f.file_name, size: f.size, path: f.path },
        })
      );
    });

    return () => {
      unIdentity.then((f) => f());
      unPeers.then((f) => f());
      unMsg.then((f) => f());
      unFile.then((f) => f());
    };
  }, []);

  // Quand on découvre un premier pair, on le sélectionne d'office.
  useEffect(() => {
    if (!active && peers.length) setActive(peers[0].peer_id);
  }, [peers, active]);

  const activePeer = useMemo(
    () => peers.find((p) => p.peer_id === active) ?? null,
    [peers, active]
  );

  async function handleSend(text: string) {
    if (!active) return;
    const ts = Date.now();
    try {
      await sendMessage(active, text);
      setThreads((t) => append(t, active, { text, ts, outgoing: true }));
    } catch (e) {
      // On affiche l'échec dans le fil plutôt que de le perdre silencieusement.
      setThreads((t) => append(t, active, { text, ts, outgoing: true, failed: true }));
      console.error("envoi échoué:", e);
    }
  }

  async function handleSendFile() {
    if (!active) return;
    const path = await pickFile();
    if (!path) return;
    const ts = Date.now();
    try {
      const info = await sendFile(active, path);
      setThreads((t) => append(t, active, { text: "", ts, outgoing: true, file: info }));
    } catch (e) {
      setThreads((t) =>
        append(t, active, { text: `fichier non envoyé : ${e}`, ts, outgoing: true, failed: true })
      );
      console.error("envoi fichier échoué:", e);
    }
  }

  async function handleRename(name: string) {
    try {
      await setName(name);
      setMe((m) => (m ? { ...m, name } : m));
    } catch (e) {
      console.error(e);
    }
  }

  async function handleConnectOnion(onion: string) {
    try {
      await connectOnion(onion);
    } catch (e) {
      alert("Connexion impossible : " + e);
    }
  }

  function handleCall(video: boolean) {
    if (!active) return;
    startCall(active, video).catch((e) =>
      alert("Impossible d'accéder au micro/caméra : " + e)
    );
  }

  const callPeerName = call
    ? peers.find((p) => p.peer_id === call.peerId)?.name ?? "Pair inconnu"
    : "";

  return (
    <div className="app">
      <Sidebar
        me={me}
        peers={peers}
        active={active}
        onSelect={setActive}
        onRename={handleRename}
        onConnectOnion={handleConnectOnion}
      />
      <Chat
        peer={activePeer}
        messages={active ? threads[active] ?? [] : []}
        onSend={handleSend}
        onSendFile={handleSendFile}
        onCall={handleCall}
        inCall={call !== null}
      />
      {call && (
        <Call
          call={call}
          peerName={callPeerName}
          onAccept={acceptCall}
          onHangup={hangup}
          onToggleMute={toggleMute}
          onToggleCam={toggleCam}
        />
      )}
    </div>
  );
}

function append(
  threads: Record<string, ChatMessage[]>,
  peerId: string,
  msg: ChatMessage
): Record<string, ChatMessage[]> {
  return { ...threads, [peerId]: [...(threads[peerId] ?? []), msg] };
}
