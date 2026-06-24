import { useEffect, useRef, type MouseEvent } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openPath } from "../api";
import type { ChatMessage, Group, Peer } from "../types";
import { avatarStyle, formatDay, formatTime, formatSize, initial, isAudio, isImage, sameDay } from "../util";
import { renderRich } from "../richtext";
import { FileDoc, Moon, Phone, ShieldCheck, Users, Video } from "../icons";
import { useTranslation } from "../i18n";
import Composer from "./Composer";

interface Props {
  peer: Peer | null;
  group: Group | null;
  peers: Peer[];
  messages: ChatMessage[];
  verified: boolean;
  inCall: boolean;
  dragging: boolean;
  showFp: boolean;
  replyTo: string | null;
  onCancelReply: () => void;
  onToggleFp: () => void;
  onSend: (text: string) => void;
  onSendFile: () => void;
  onSendVoice: (bytes: number[], ext: string) => void;
  onCall: (video: boolean) => void;
  onVerify: () => void;
  onOpenImage: (src: string) => void;
  onMsgMenu: (e: MouseEvent, msg: ChatMessage, index: number) => void;
  onManageGroup: () => void;
}

export default function Chat(props: Props) {
  const { peer, group, messages, verified, inCall, dragging, showFp, replyTo, onCancelReply, onToggleFp, onSend, onSendFile, onSendVoice, onCall, onVerify, onOpenImage, onMsgMenu, onManageGroup } = props;
  const { t } = useTranslation();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (!peer && !group) {
    return (
      <main className="chat empty">
        <div className="welcome">
          <Moon size={46} className="mark" />
          <h2>{t("chat.emptyTitle")}</h2>
          <p>{t("chat.emptyBody")}</p>
        </div>
      </main>
    );
  }

  const isGroup = !!group;
  const memberCount = group ? group.members.length + 1 : 0;
  const title = group ? group.name : peer?.name ?? t("chat.unknownPeer");
  const canSend = isGroup ? group!.members.length > 0 : peer!.fingerprint !== null;
  const canCall = !isGroup && canSend && !!peer?.online && !inCall;

  return (
    <main className="chat">
      <header className="chat-head">
        {isGroup ? (
          <span className="avatar group">
            <Users size={19} />
          </span>
        ) : (
          <span className="avatar" style={avatarStyle(peer!.peer_id)}>
            {initial(peer!.name)}
            <span className={"presence" + (peer!.online ? " on" : "")} />
          </span>
        )}
        <div className="row-text">
          <span className="row-name">
            {title}
            {isGroup ? (
              <span className="badge">{t("group.badge")}</span>
            ) : (
              peer!.transport === "tor" && <span className="badge tor">tor</span>
            )}
          </span>
          <span className={"chat-status" + (!isGroup && peer!.online ? " on" : "")}>
            {isGroup
              ? `${memberCount} ${memberCount > 1 ? t("group.memberCount") : t("group.oneMember")}`
              : peer!.online
              ? t("chat.online")
              : t("chat.offline")}
          </span>
        </div>
        <div className="head-actions">
          {isGroup ? (
            <button className="icon-btn" onClick={onManageGroup} title={t("group.manage")}>
              <Users />
            </button>
          ) : (
            <>
              <button className="icon-btn" disabled={!canCall} onClick={() => onCall(false)} title={t("chat.audioCall")}>
                <Phone />
              </button>
              <button className="icon-btn" disabled={!canCall} onClick={() => onCall(true)} title={t("chat.videoCall")}>
                <Video />
              </button>
              <button className={"icon-btn" + (verified ? " on" : "")} onClick={onToggleFp} title={t("chat.verifyIdentity")}>
                <ShieldCheck />
              </button>
            </>
          )}
        </div>
      </header>

      {showFp && !isGroup && (
        <div className="fp-panel">
          <p>{t("chat.fpHelp")}</p>
          <code>{peer!.fingerprint ?? t("chat.waitingKey")}</code>
          <div className="fp-actions">
            <button className={"btn" + (verified ? " primary" : "")} disabled={!peer!.fingerprint} onClick={onVerify}>
              <ShieldCheck size={15} /> {verified ? t("network.verified") : t("chat.markVerified")}
            </button>
          </div>
        </div>
      )}

      <div className="messages">
        {messages.length === 0 && <div className="no-msg">{isGroup ? t("group.empty") : t("chat.noMessages")}</div>}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || !sameDay(prev.ts, m.ts);
          const sameSender = !!prev && prev.outgoing === m.outgoing && prev.from === m.from;
          const grouped = !newDay && sameSender && !prev!.file && !m.file;
          const img = m.file && m.file.path && isImage(m.file.name);
          const audio = m.file && m.file.path && isAudio(m.file.name);
          const showSender = isGroup && !m.outgoing && !!m.from && !grouped;
          return (
            <div key={i} style={{ display: "contents" }}>
              {newDay && <div className="day-sep">{formatDay(m.ts)}</div>}
              <div
                className={"bubble " + (m.outgoing ? "out" : "in") + (grouped ? " grouped" : "") + (m.failed ? " failed" : "") + (img ? " media" : "")}
                onContextMenu={(e) => onMsgMenu(e, m, i)}
              >
                {showSender && <span className="sender">{m.from}</span>}
                {img ? (
                  <img className="msg-img" src={convertFileSrc(m.file!.path!)} alt={m.file!.name} onClick={() => onOpenImage(convertFileSrc(m.file!.path!))} />
                ) : audio ? (
                  <audio className="msg-audio" controls src={convertFileSrc(m.file!.path!)} />
                ) : m.file ? (
                  <button
                    type="button"
                    className="file-card"
                    title={m.file.path ?? m.file.name}
                    onClick={() => m.file?.path && openPath(m.file.path)}
                  >
                    <span className="file-ic">
                      <FileDoc size={19} />
                    </span>
                    <span>
                      <span className="file-name" style={{ display: "block" }}>{m.file.name}</span>
                      <span className="file-sub">
                        {formatSize(m.file.size)}
                        {m.outgoing ? ` · ${t("chat.sent")}` : ` · ${t("chat.receivedDownloads")}`}
                      </span>
                    </span>
                  </button>
                ) : (
                  <span className="bubble-text">{renderBody(m.text)}</span>
                )}
                <span className="bubble-meta">
                  {m.failed && <span className="warn">{t("chat.notSent")} · </span>}
                  {formatTime(m.ts)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {replyTo && (
        <div className="reply-bar">
          <span className="reply-quote">{t("chat.replyTo")} {replyTo}</span>
          <button className="c-btn" onClick={onCancelReply} title={t("chat.cancel")}>
            x
          </button>
        </div>
      )}

      <Composer
        disabled={!canSend}
        allowMedia={!isGroup}
        placeholder={canSend ? `${t("chat.messageTo")} ${title}...` : isGroup ? t("group.empty") : t("chat.keyExchange")}
        onSend={onSend}
        onSendFile={onSendFile}
        onSendVoice={onSendVoice}
      />

      {dragging && !isGroup && <div className="drop">{t("chat.drop")}</div>}
    </main>
  );
}

function renderBody(text: string) {
  const lines = text.split("\n");
  const quote: string[] = [];
  let i = 0;
  while (i < lines.length && lines[i].startsWith("> ")) {
    quote.push(lines[i].slice(2));
    i++;
  }
  const rest = lines.slice(i).join("\n");
  return (
    <>
      {quote.length > 0 && <span className="quote">{quote.join("\n")}</span>}
      {rest && renderRich(rest, openPath)}
    </>
  );
}
