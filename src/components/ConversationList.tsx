import { useState, type MouseEvent } from "react";
import type { ChatMessage, Group, Peer } from "../types";
import { avatarStyle, initial, shortId } from "../util";
import { BellOff, Check, Pin, Search, Users, UserPlus } from "../icons";
import { useTranslation } from "../i18n";

interface Props {
  peers: Peer[];
  groups: Group[];
  threads: Record<string, ChatMessage[]>;
  active: string | null;
  verified: Record<string, string>;
  unread: Record<string, number>;
  pinned: Set<string>;
  muted: Set<string>;
  onSelect: (id: string) => void;
  onRowMenu: (e: MouseEvent, id: string) => void;
  onNewGroup: () => void;
}

export default function ConversationList({ peers, groups, threads, active, verified, unread, pinned, muted, onSelect, onRowMenu, onNewGroup }: Props) {
  const [q, setQ] = useState("");
  const { t } = useTranslation();
  const needle = q.toLowerCase();

  const peerList = peers
    .filter((p) => `${p.name ?? ""} ${p.peer_id}`.toLowerCase().includes(needle))
    .sort((a, b) => (pinned.has(b.peer_id) ? 1 : 0) - (pinned.has(a.peer_id) ? 1 : 0));
  const groupList = groups.filter((g) => g.name.toLowerCase().includes(needle));

  function preview(id: string, fallback: string): string {
    const arr = threads[id];
    const last = arr && arr.length ? arr[arr.length - 1] : undefined;
    if (!last) return fallback;
    if (last.file) return `${last.outgoing ? t("list.sent") : t("list.received")} · ${last.file.name}`;
    const who = last.outgoing ? t("list.you") : last.from ? `${last.from}: ` : "";
    return who + last.text;
  }

  return (
    <div className="col-list">
      <div className="list-head">
        <div className="list-top">
          <h2>{t("view.messages")}</h2>
          <button className="new-btn" onClick={onNewGroup} title={t("group.new")}>
            <UserPlus size={17} />
          </button>
        </div>
        <div className="search">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("list.search")} />
        </div>
      </div>
      <div className="list-scroll">
        {groupList.length === 0 && peerList.length === 0 && <div className="list-empty">{t("list.empty")}</div>}

        {groupList.length > 0 && <div className="list-label">{t("list.groups")}</div>}
        {groupList.map((g) => {
          const count = g.members.length + 1;
          return (
            <button
              key={g.id}
              className={"row" + (g.id === active ? " active" : "")}
              onClick={() => onSelect(g.id)}
              onContextMenu={(e) => onRowMenu(e, g.id)}
            >
              <span className="avatar group">
                <Users size={20} />
              </span>
              <span className="row-text">
                <span className="row-name">
                  {pinned.has(g.id) && <Pin size={12} className="vcheck" />}
                  {g.name}
                  {muted.has(g.id) && <BellOff size={12} className="muted-ic" />}
                </span>
                <span className="row-sub">{preview(g.id, `${count} ${count > 1 ? t("group.memberCount") : t("group.oneMember")}`)}</span>
              </span>
              {unread[g.id] > 0 && !muted.has(g.id) && <span className="unread">{unread[g.id]}</span>}
            </button>
          );
        })}

        {groupList.length > 0 && peerList.length > 0 && <div className="list-label">{t("list.direct")}</div>}
        {peerList.map((p) => (
          <button
            key={p.peer_id}
            className={"row" + (p.peer_id === active ? " active" : "")}
            onClick={() => onSelect(p.peer_id)}
            onContextMenu={(e) => onRowMenu(e, p.peer_id)}
          >
            <span className="avatar" style={avatarStyle(p.peer_id)}>
              {initial(p.name)}
              <span className={"presence" + (p.online ? " on" : "")} />
            </span>
            <span className="row-text">
              <span className="row-name">
                {pinned.has(p.peer_id) && <Pin size={12} className="vcheck" />}
                {p.name ?? shortId(p.peer_id)}
                {verified[p.peer_id] === p.fingerprint && <Check size={13} className="vcheck" />}
                {muted.has(p.peer_id) && <BellOff size={12} className="muted-ic" />}
                {p.transport === "tor" && <span className="badge tor">tor</span>}
              </span>
              <span className="row-sub">{preview(p.peer_id, "—")}</span>
            </span>
            {unread[p.peer_id] > 0 && !muted.has(p.peer_id) && <span className="unread">{unread[p.peer_id]}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
