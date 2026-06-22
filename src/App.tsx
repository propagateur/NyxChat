import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  connectOnion,
  getIdentity,
  listPeers,
  notify,
  onFile,
  onIdentity,
  onMessage,
  onPeers,
  pickFile,
  sendFile,
  sendMessage,
  setName,
} from "./api";
import type { Accent, ChatMessage, Identity, Peer, View } from "./types";
import { applyAccent, loadAccent } from "./theme";
import { useCall } from "./useCall";
import Rail from "./components/Rail";
import Home from "./components/Home";
import ConversationList from "./components/ConversationList";
import Chat from "./components/Chat";
import Network from "./components/Network";
import SettingsView from "./components/SettingsView";
import Call from "./components/Call";
import CommandPalette from "./components/CommandPalette";

export default function App() {
  const [me, setMe] = useState<Identity | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});
  const [active, setActive] = useState<string | null>(null);
  const [view, setView] = useState<View>("home");
  const [verified, setVerified] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("nyx.verified") ?? "{}");
    } catch {
      return {};
    }
  });
  const [accent, setAccent] = useState<Accent>(loadAccent());
  const [cmdOpen, setCmdOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showFp, setShowFp] = useState(false);
  const [unread, setUnread] = useState<Set<string>>(new Set());

  const { call, startCall, acceptCall, hangup, toggleMute, toggleCam } = useCall();

  // refs pour les closures d'events (créées une seule fois)
  const viewRef = useRef(view);
  viewRef.current = view;
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => applyAccent(accent), [accent]);

  useEffect(() => {
    getIdentity().then(setMe).catch(console.error);
    listPeers().then(setPeers).catch(console.error);

    const unId = onIdentity(setMe);
    const unPeers = onPeers(setPeers);
    const unMsg = onMessage((m) => {
      setThreads((t) => append(t, m.peer_id, { text: m.text, ts: m.ts, outgoing: false }));
      const focused = viewRef.current === "messages" && activeRef.current === m.peer_id && !document.hidden;
      if (!focused) {
        setUnread((s) => new Set(s).add(m.peer_id));
        notify(m.name ?? "Nouveau message", m.text);
      }
    });
    const unFile = onFile((f) => {
      setThreads((t) =>
        append(t, f.peer_id, { text: "", ts: f.ts, outgoing: false, file: { name: f.file_name, size: f.size, path: f.path } })
      );
      if (!(viewRef.current === "messages" && activeRef.current === f.peer_id)) {
        setUnread((s) => new Set(s).add(f.peer_id));
        notify(f.from_name ?? "Fichier reçu", f.file_name);
      }
    });

    return () => {
      unId.then((f) => f());
      unPeers.then((f) => f());
      unMsg.then((f) => f());
      unFile.then((f) => f());
    };
  }, []);

  // Palette de commandes (Ctrl/Cmd-K)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Glisser-déposer de fichiers (event natif Tauri → vrais chemins)
  useEffect(() => {
    const un = getCurrentWebview().onDragDropEvent((e) => {
      const p = e.payload as { type: string; paths?: string[] };
      if (p.type === "over" || p.type === "enter") setDragging(true);
      else if (p.type === "leave") setDragging(false);
      else if (p.type === "drop") {
        setDragging(false);
        const peer = activeRef.current;
        if (peer && p.paths) {
          for (const path of p.paths) void sendFilePath(peer, path);
        }
      }
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (!active && peers.length) setActive(peers[0].peer_id);
  }, [peers, active]);

  useEffect(() => setShowFp(false), [active]);

  const activePeer = useMemo(() => peers.find((p) => p.peer_id === active) ?? null, [peers, active]);

  function selectPeer(id: string) {
    setActive(id);
    setView("messages");
    setUnread((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }

  async function handleSend(text: string) {
    if (!active) return;
    const ts = Date.now();
    try {
      await sendMessage(active, text);
      setThreads((t) => append(t, active, { text, ts, outgoing: true }));
    } catch (e) {
      setThreads((t) => append(t, active, { text, ts, outgoing: true, failed: true }));
      console.error(e);
    }
  }

  async function sendFilePath(peerId: string, path: string) {
    const ts = Date.now();
    try {
      const info = await sendFile(peerId, path);
      setThreads((t) => append(t, peerId, { text: "", ts, outgoing: true, file: info }));
    } catch (e) {
      setThreads((t) => append(t, peerId, { text: `fichier non envoyé : ${e}`, ts, outgoing: true, failed: true }));
      console.error(e);
    }
  }

  async function handleSendFile() {
    if (!active) return;
    const path = await pickFile();
    if (path) sendFilePath(active, path);
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
      setView("network");
    } catch (e) {
      alert("Connexion impossible : " + e);
    }
  }

  function handleCall(video: boolean) {
    if (active) startCall(active, video).catch((e) => alert("Accès micro/caméra impossible : " + e));
  }

  function toggleVerify(id: string) {
    setVerified((v) => {
      const n = { ...v, [id]: !v[id] };
      localStorage.setItem("nyx.verified", JSON.stringify(n));
      return n;
    });
  }

  const callPeerName = call ? peers.find((p) => p.peer_id === call.peerId)?.name ?? "Pair inconnu" : "";

  return (
    <div className="app">
      <Rail view={view} onView={setView} hasUnread={unread.size > 0} />

      <div className="surface">
        {view === "home" && <Home me={me} peers={peers} onConnectOnion={handleConnectOnion} />}

        {view === "messages" && (
          <>
            <ConversationList peers={peers} threads={threads} active={active} verified={verified} onSelect={selectPeer} />
            <Chat
              peer={activePeer}
              messages={active ? threads[active] ?? [] : []}
              verified={active ? !!verified[active] : false}
              inCall={call !== null}
              dragging={dragging}
              showFp={showFp}
              onToggleFp={() => setShowFp((v) => !v)}
              onSend={handleSend}
              onSendFile={handleSendFile}
              onCall={handleCall}
              onVerify={() => active && toggleVerify(active)}
            />
          </>
        )}

        {view === "network" && (
          <Network
            peers={peers}
            verified={verified}
            onConnectOnion={handleConnectOnion}
            onVerify={toggleVerify}
            onOpenChat={selectPeer}
          />
        )}

        {view === "settings" && (
          <SettingsView me={me} accent={accent} onRename={handleRename} onAccent={setAccent} />
        )}
      </div>

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

      {cmdOpen && (
        <CommandPalette
          peers={peers}
          onClose={() => setCmdOpen(false)}
          onNavigate={setView}
          onOpenPeer={selectPeer}
        />
      )}
    </div>
  );
}

function append(threads: Record<string, ChatMessage[]>, peerId: string, msg: ChatMessage): Record<string, ChatMessage[]> {
  return { ...threads, [peerId]: [...(threads[peerId] ?? []), msg] };
}
