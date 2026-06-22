import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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
  sendVoice,
  setName,
} from "./api";
import type { Accent, ChatMessage, Identity, Peer, View } from "./types";
import { applyAccent, applyTheme, loadAccent, loadBool, loadTheme, saveBool, type Theme } from "./theme";
import { useCall } from "./useCall";
import Rail from "./components/Rail";
import Home from "./components/Home";
import ConversationList from "./components/ConversationList";
import Chat from "./components/Chat";
import Network from "./components/Network";
import SettingsView from "./components/SettingsView";
import Call from "./components/Call";
import CommandPalette from "./components/CommandPalette";
import ContextMenu, { type CtxItem } from "./components/ContextMenu";
import { useTranslation } from "./i18n";

function loadThreads(): Record<string, ChatMessage[]> {
  if (!loadBool("nyx.keepHistory", false)) return {};
  try {
    return JSON.parse(localStorage.getItem("nyx.threads") ?? "{}");
  } catch {
    return {};
  }
}

export default function App() {
  const { t } = useTranslation();
  const [me, setMe] = useState<Identity | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>(loadThreads);
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
  const [theme, setTheme] = useState<Theme>(loadTheme());
  const [keepHistory, setKeepHistory] = useState(loadBool("nyx.keepHistory", false));
  const [cmdOpen, setCmdOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showFp, setShowFp] = useState(false);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: CtxItem[] } | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [pinned, setPinned] = useState<Set<string>>(() => loadSet("nyx.pinned"));
  const [muted, setMuted] = useState<Set<string>>(() => loadSet("nyx.muted"));

  const { call, startCall, acceptCall, hangup, toggleMute, toggleCam } = useCall();

  const viewRef = useRef(view);
  viewRef.current = view;
  const activeRef = useRef(active);
  activeRef.current = active;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => applyAccent(accent), [accent]);
  useEffect(() => applyTheme(theme), [theme]);

  // Persistance optionnelle de l'historique.
  useEffect(() => {
    if (keepHistory) localStorage.setItem("nyx.threads", JSON.stringify(threads));
    else localStorage.removeItem("nyx.threads");
  }, [threads, keepHistory]);

  useEffect(() => {
    getIdentity().then(setMe).catch(console.error);
    listPeers().then(setPeers).catch(console.error);

    const unId = onIdentity(setMe);
    const unPeers = onPeers(setPeers);
    const unMsg = onMessage((m) => {
      setThreads((t) => append(t, m.peer_id, { text: m.text, ts: m.ts, outgoing: false }));
      const focused = viewRef.current === "messages" && activeRef.current === m.peer_id && !document.hidden;
      if (!focused) {
        bumpUnread(m.peer_id);
        if (!mutedRef.current.has(m.peer_id)) notify(m.name ?? t("view.messages"), m.text);
      }
    });
    const unFile = onFile((f) => {
      setThreads((t) => append(t, f.peer_id, { text: "", ts: f.ts, outgoing: false, file: { name: f.file_name, size: f.size, path: f.path } }));
      if (!(viewRef.current === "messages" && activeRef.current === f.peer_id)) {
        bumpUnread(f.peer_id);
        if (!mutedRef.current.has(f.peer_id)) notify(f.from_name ?? t("list.received"), f.file_name);
      }
    });

    return () => {
      unId.then((f) => f());
      unPeers.then((f) => f());
      unMsg.then((f) => f());
      unFile.then((f) => f());
    };
  }, []);

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

  useEffect(() => {
    const un = getCurrentWebview().onDragDropEvent((e) => {
      const p = e.payload as { type: string; paths?: string[] };
      if (p.type === "over" || p.type === "enter") setDragging(true);
      else if (p.type === "leave") setDragging(false);
      else if (p.type === "drop") {
        setDragging(false);
        const peer = activeRef.current;
        if (peer && p.paths) for (const path of p.paths) void sendFilePath(peer, path);
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
  const totalUnread = useMemo(() => Object.values(unread).reduce((a, b) => a + b, 0), [unread]);

  function bumpUnread(id: string) {
    setUnread((u) => ({ ...u, [id]: (u[id] ?? 0) + 1 }));
  }

  function selectPeer(id: string) {
    setActive(id);
    setView("messages");
    setUnread((u) => ({ ...u, [id]: 0 }));
  }

  async function handleSend(text: string) {
    if (!active) return;
    const body = replyTo ? `> ${replyTo}\n${text}` : text;
    const ts = Date.now();
    setReplyTo(null);
    try {
      await sendMessage(active, body);
      setThreads((t) => append(t, active, { text: body, ts, outgoing: true }));
    } catch (e) {
      setThreads((t) => append(t, active, { text: body, ts, outgoing: true, failed: true }));
      console.error(e);
    }
  }

  function deleteMessage(peerId: string, index: number) {
    setThreads((t) => ({ ...t, [peerId]: (t[peerId] ?? []).filter((_, i) => i !== index) }));
  }
  function togglePin(id: string) {
    setPinned((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      saveSet("nyx.pinned", n);
      return n;
    });
  }
  function toggleMutePeer(id: string) {
    setMuted((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      saveSet("nyx.muted", n);
      return n;
    });
  }
  function openMsgMenu(e: MouseEvent, msg: ChatMessage, index: number) {
    e.preventDefault();
    if (!active) return;
    const items: CtxItem[] = [];
    if (msg.text && !msg.file) {
      items.push({ label: t("chat.reply"), onClick: () => setReplyTo(msg.text.replace(/^> .*\n/, "").slice(0, 120)) });
      items.push({ label: t("chat.copy"), onClick: () => navigator.clipboard.writeText(msg.text) });
    }
    items.push({ label: t("chat.delete"), danger: true, onClick: () => deleteMessage(active, index) });
    setMenu({ x: e.clientX, y: e.clientY, items });
  }
  function openConvMenu(e: MouseEvent, peerId: string) {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: pinned.has(peerId) ? t("chat.unpin") : t("chat.pin"), onClick: () => togglePin(peerId) },
        { label: muted.has(peerId) ? t("chat.unmute") : t("chat.mute"), onClick: () => toggleMutePeer(peerId) },
      ],
    });
  }

  async function sendFilePath(peerId: string, path: string) {
    const ts = Date.now();
    try {
      const info = await sendFile(peerId, path);
      setThreads((t) => append(t, peerId, { text: "", ts, outgoing: true, file: info }));
    } catch (e) {
      setThreads((threads) => append(threads, peerId, { text: `${t("chat.fileNotSent")} ${e}`, ts, outgoing: true, failed: true }));
      console.error(e);
    }
  }

  async function handleSendFile() {
    if (!active) return;
    const path = await pickFile();
    if (path) sendFilePath(active, path);
  }

  async function handleSendVoice(bytes: number[], ext: string) {
    if (!active) return;
    const ts = Date.now();
    try {
      const info = await sendVoice(active, bytes, ext);
      setThreads((threads) => append(threads, active, { text: "", ts, outgoing: true, file: { name: t("chat.voiceMessage"), size: info.size, path: info.path } }));
    } catch (e) {
      console.error("voice:", e);
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
      setView("network");
    } catch (e) {
      alert(t("chat.connectionFailed") + e);
    }
  }

  function handleCall(video: boolean) {
    if (active) startCall(active, video).catch((e) => alert(t("chat.mediaAccessFailed") + e));
  }

  function toggleVerify(id: string) {
    setVerified((v) => {
      const n = { ...v, [id]: !v[id] };
      localStorage.setItem("nyx.verified", JSON.stringify(n));
      return n;
    });
  }

  function changeKeepHistory(v: boolean) {
    setKeepHistory(v);
    saveBool("nyx.keepHistory", v);
  }

  const callPeerName = call ? peers.find((p) => p.peer_id === call.peerId)?.name ?? t("chat.unknownPeer") : "";

  return (
    <div className="app">
      <Rail view={view} onView={setView} unreadCount={totalUnread} />

      <div className="surface">
        {view === "home" && <Home me={me} peers={peers} onConnectOnion={handleConnectOnion} />}

        {view === "messages" && (
          <>
            <ConversationList
              peers={peers}
              threads={threads}
              active={active}
              verified={verified}
              unread={unread}
              pinned={pinned}
              muted={muted}
              onSelect={selectPeer}
              onRowMenu={openConvMenu}
            />
            <Chat
              peer={activePeer}
              messages={active ? threads[active] ?? [] : []}
              verified={active ? !!verified[active] : false}
              inCall={call !== null}
              dragging={dragging}
              showFp={showFp}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              onToggleFp={() => setShowFp((v) => !v)}
              onSend={handleSend}
              onSendFile={handleSendFile}
              onSendVoice={handleSendVoice}
              onCall={handleCall}
              onVerify={() => active && toggleVerify(active)}
              onOpenImage={setLightbox}
              onMsgMenu={openMsgMenu}
            />
          </>
        )}

        {view === "network" && (
          <Network peers={peers} verified={verified} onConnectOnion={handleConnectOnion} onVerify={toggleVerify} onOpenChat={selectPeer} />
        )}

        {view === "settings" && (
          <SettingsView
            me={me}
            accent={accent}
            theme={theme}
            keepHistory={keepHistory}
            onRename={handleRename}
            onAccent={setAccent}
            onTheme={setTheme}
            onKeepHistory={changeKeepHistory}
          />
        )}
      </div>

      {call && (
        <Call call={call} peerName={callPeerName} onAccept={acceptCall} onHangup={hangup} onToggleMute={toggleMute} onToggleCam={toggleCam} />
      )}

      {cmdOpen && <CommandPalette peers={peers} onClose={() => setCmdOpen(false)} onNavigate={setView} onOpenPeer={selectPeer} />}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" />
        </div>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}

function append(threads: Record<string, ChatMessage[]>, peerId: string, msg: ChatMessage): Record<string, ChatMessage[]> {
  return { ...threads, [peerId]: [...(threads[peerId] ?? []), msg] };
}

function loadSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? "[]"));
  } catch {
    return new Set();
  }
}

function saveSet(key: string, s: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...s]));
}
