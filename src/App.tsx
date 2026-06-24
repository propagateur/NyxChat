import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  connectOnion,
  getIdentity,
  groupLeaveCmd,
  listPeers,
  notify,
  onConnectError,
  onFile,
  onGroupInvite,
  onGroupLeave,
  onGroupMessage,
  onIdentity,
  onMessage,
  onPeers,
  onTorError,
  pickFile,
  sendFile,
  sendGroup,
  sendInvite,
  sendMessage,
  sendVoice,
  setName,
} from "./api";
import type { Accent, ChatMessage, Group, Identity, Peer, View } from "./types";
import { applyAccent, applySkin, applyTheme, loadAccent, loadSkin, loadBool, loadTheme, saveBool, type Skin, type Theme } from "./theme";
import { playMessage } from "./sound";
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
import NewGroup from "./components/NewGroup";
import GroupManage from "./components/GroupManage";
import { useTranslation } from "./i18n";

function loadThreads(): Record<string, ChatMessage[]> {
  if (!loadBool("nyx.keepHistory", false)) return {};
  try {
    return JSON.parse(localStorage.getItem("nyx.threads") ?? "{}");
  } catch {
    return {};
  }
}

function loadGroups(): Record<string, Group> {
  try {
    return JSON.parse(localStorage.getItem("nyx.groups") ?? "{}");
  } catch {
    return {};
  }
}

function randomHex(bytes: number): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export default function App() {
  const { t } = useTranslation();
  const [me, setMe] = useState<Identity | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [groups, setGroups] = useState<Record<string, Group>>(loadGroups);
  const [torError, setTorError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>(loadThreads);
  const [active, setActive] = useState<string | null>(null);
  const [view, setView] = useState<View>("home");
  const [verified, setVerified] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem("nyx.verified") ?? "{}");
    } catch {
      return {};
    }
  });
  const [accent, setAccent] = useState<Accent>(loadAccent());
  const [theme, setTheme] = useState<Theme>(loadTheme());
  const [skin, setSkin] = useState<Skin>(loadSkin());
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
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [manageGid, setManageGid] = useState<string | null>(null);
  const [callMin, setCallMin] = useState(false);

  const { call, callError, startCall, acceptCall, hangup, toggleMute, toggleCam, dismissError } = useCall();

  useEffect(() => {
    if (!call) setCallMin(false);
  }, [call]);

  const viewRef = useRef(view);
  viewRef.current = view;
  const activeRef = useRef(active);
  activeRef.current = active;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const meRef = useRef(me);
  meRef.current = me;

  useEffect(() => applyAccent(accent), [accent]);
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => applySkin(skin), [skin]);

  useEffect(() => {
    if (keepHistory) localStorage.setItem("nyx.threads", JSON.stringify(threads));
    else localStorage.removeItem("nyx.threads");
  }, [threads, keepHistory]);

  useEffect(() => {
    localStorage.setItem("nyx.groups", JSON.stringify(groups));
  }, [groups]);

  useEffect(() => {
    getIdentity().then(setMe).catch(console.error);
    listPeers().then(setPeers).catch(console.error);

    const unId = onIdentity((id) => {
      setMe(id);
      if (id.onion) setTorError(null);
    });
    const unPeers = onPeers(setPeers);
    const unTor = onTorError(setTorError);
    const unConn = onConnectError(setNotice);
    const unMsg = onMessage((m) => {
      setThreads((t) => append(t, m.peer_id, { text: m.text, ts: m.ts, outgoing: false }));
      const focused = viewRef.current === "messages" && activeRef.current === m.peer_id && !document.hidden;
      if (!focused) {
        bumpUnread(m.peer_id);
        if (!mutedRef.current.has(m.peer_id)) {
          notify(m.name ?? t("view.messages"), m.text);
          playMessage();
        }
      }
    });
    const unFile = onFile((f) => {
      setThreads((t) => append(t, f.peer_id, { text: "", ts: f.ts, outgoing: false, file: { name: f.file_name, size: f.size, path: f.path } }));
      if (!(viewRef.current === "messages" && activeRef.current === f.peer_id)) {
        bumpUnread(f.peer_id);
        if (!mutedRef.current.has(f.peer_id)) {
          notify(f.from_name ?? t("list.received"), f.file_name);
          playMessage();
        }
      }
    });
    const unGMsg = onGroupMessage((m) => {
      setThreads((t) => append(t, m.gid, { text: m.text, ts: m.ts, outgoing: false, from: m.name ?? undefined }));
      const focused = viewRef.current === "messages" && activeRef.current === m.gid && !document.hidden;
      if (!focused) {
        bumpUnread(m.gid);
        if (!mutedRef.current.has(m.gid)) {
          const g = groupsRef.current[m.gid];
          notify(g?.name ?? t("view.messages"), `${m.name ? m.name + ": " : ""}${m.text}`);
          playMessage();
        }
      }
    });
    const unGInv = onGroupInvite((g) => {
      setGroups((gs) => ({
        ...gs,
        [g.gid]: { id: g.gid, name: g.name, members: g.members, owner: gs[g.gid]?.owner ?? false },
      }));
      setNotice(`${g.name} · ${t("group.invited")}`);
    });
    const unGLeave = onGroupLeave((g) => {
      setGroups((gs) => {
        const grp = gs[g.gid];
        if (!grp) return gs;
        return { ...gs, [g.gid]: { ...grp, members: grp.members.filter((id) => id !== g.peer_id) } };
      });
    });

    return () => {
      unId.then((f) => f());
      unPeers.then((f) => f());
      unTor.then((f) => f());
      unConn.then((f) => f());
      unMsg.then((f) => f());
      unFile.then((f) => f());
      unGMsg.then((f) => f());
      unGInv.then((f) => f());
      unGLeave.then((f) => f());
    };
  }, []);

  const prevPeerCount = useRef(0);
  useEffect(() => {
    if (peers.length > prevPeerCount.current) setNotice(null);
    prevPeerCount.current = peers.length;
  }, [peers]);
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 12000);
    return () => clearTimeout(id);
  }, [notice]);

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
        if (peer && !groupsRef.current[peer] && p.paths) for (const path of p.paths) void sendFilePath(peer, path);
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
  const activeGroup = active ? groups[active] ?? null : null;
  const totalUnread = useMemo(() => Object.values(unread).reduce((a, b) => a + b, 0), [unread]);
  const groupList = useMemo(() => Object.values(groups), [groups]);

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
    const grp = groups[active];
    try {
      if (grp) await sendGroup(grp.id, body, grp.members);
      else await sendMessage(active, body);
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
    if (!active || groups[active]) return;
    const path = await pickFile();
    if (path) sendFilePath(active, path);
  }

  async function handleSendVoice(bytes: number[], ext: string) {
    if (!active || groups[active]) return;
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
      setNotice(t("home.connecting"));
      setView("network");
    } catch (e) {
      setNotice(t("chat.connectionFailed") + e);
    }
  }

  function handleCall(video: boolean) {
    if (active && !groups[active]) startCall(active, video).catch((e) => setNotice(t("chat.mediaAccessFailed") + e));
  }

  function toggleVerify(id: string) {
    const fp = peers.find((p) => p.peer_id === id)?.fingerprint;
    if (!fp) return;
    setVerified((v) => {
      const n = { ...v };
      if (n[id] === fp) delete n[id];
      else n[id] = fp;
      localStorage.setItem("nyx.verified", JSON.stringify(n));
      return n;
    });
  }

  function changeKeepHistory(v: boolean) {
    setKeepHistory(v);
    saveBool("nyx.keepHistory", v);
  }

  function createGroup(name: string, memberKeys: string[]) {
    const gid = randomHex(16);
    const myKey = meRef.current?.key;
    setGroups((gs) => ({ ...gs, [gid]: { id: gid, name, members: memberKeys, owner: true } }));
    const all = myKey ? [myKey, ...memberKeys] : memberKeys;
    for (const key of memberKeys) {
      const roster = all.filter((k) => k !== key);
      sendInvite(key, gid, name, roster).catch(console.error);
    }
    setNewGroupOpen(false);
    setActive(gid);
    setView("messages");
  }

  function addGroupMembers(gid: string, newKeys: string[]) {
    const grp = groups[gid];
    if (!grp || newKeys.length === 0) return;
    const myKey = meRef.current?.key;
    const members = Array.from(new Set([...grp.members, ...newKeys]));
    setGroups((gs) => ({ ...gs, [gid]: { ...grp, members } }));
    const all = myKey ? [myKey, ...members] : members;
    for (const key of members) {
      const roster = all.filter((k) => k !== key);
      sendInvite(key, gid, grp.name, roster).catch(console.error);
    }
  }

  function leaveGroup(gid: string) {
    const grp = groups[gid];
    if (!grp) return;
    groupLeaveCmd(gid, grp.members).catch(console.error);
    setGroups((gs) => {
      const n = { ...gs };
      delete n[gid];
      return n;
    });
    if (active === gid) setActive(null);
    setManageGid(null);
  }

  const callPeerName = call ? peers.find((p) => p.peer_id === call.peerId)?.name ?? t("chat.unknownPeer") : "";
  const manageGroup = manageGid ? groups[manageGid] ?? null : null;

  return (
    <div className="app">
      <Rail view={view} onView={setView} unreadCount={totalUnread} />

      <div className="surface">
        {view === "home" && <Home me={me} peers={peers} torError={torError} onConnectOnion={handleConnectOnion} />}

        {view === "messages" && (
          <>
            <ConversationList
              peers={peers}
              groups={groupList}
              threads={threads}
              active={active}
              verified={verified}
              unread={unread}
              pinned={pinned}
              muted={muted}
              onSelect={selectPeer}
              onRowMenu={openConvMenu}
              onNewGroup={() => setNewGroupOpen(true)}
            />
            <Chat
              peer={activeGroup ? null : activePeer}
              group={activeGroup}
              peers={peers}
              messages={active ? threads[active] ?? [] : []}
              verified={!!activePeer && verified[activePeer.peer_id] === activePeer.fingerprint}
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
              onManageGroup={() => activeGroup && setManageGid(activeGroup.id)}
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
            skin={skin}
            keepHistory={keepHistory}
            onRename={handleRename}
            onAccent={setAccent}
            onTheme={setTheme}
            onSkin={setSkin}
            onKeepHistory={changeKeepHistory}
            onClearHistory={() => {
              setThreads({});
              localStorage.removeItem("nyx.threads");
            }}
          />
        )}
      </div>

      {call && (
        <Call
          call={call}
          peerName={callPeerName}
          minimized={callMin}
          onToggleMinimize={() => setCallMin((v) => !v)}
          onAccept={acceptCall}
          onHangup={hangup}
          onToggleMute={toggleMute}
          onToggleCam={toggleCam}
        />
      )}

      {callError && (
        <div className="toast" role="alert" onClick={dismissError}>{callError}</div>
      )}

      {notice && (
        <div className="toast" role="status" onClick={() => setNotice(null)}>{notice}</div>
      )}

      {cmdOpen && <CommandPalette peers={peers} onClose={() => setCmdOpen(false)} onNavigate={setView} onOpenPeer={selectPeer} />}

      {newGroupOpen && (
        <NewGroup peers={peers} onClose={() => setNewGroupOpen(false)} onCreate={createGroup} />
      )}

      {manageGroup && (
        <GroupManage
          group={manageGroup}
          peers={peers}
          onClose={() => setManageGid(null)}
          onAddMembers={(ids) => addGroupMembers(manageGroup.id, ids)}
          onLeave={() => leaveGroup(manageGroup.id)}
        />
      )}

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
