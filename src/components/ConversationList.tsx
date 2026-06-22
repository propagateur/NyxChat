import { useState, type MouseEvent } from "react";
import type { ChatMessage, Peer } from "../types";
import { avatarStyle, initial, shortId } from "../util";
import { BellOff, Check, Pin, Search } from "../icons";

interface Props {
  peers: Peer[];
  threads: Record<string, ChatMessage[]>;
  active: string | null;
  verified: Record<string, boolean>;
  unread: Record<string, number>;
  pinned: Set<string>;
  muted: Set<string>;
  onSelect: (peerId: string) => void;
  onRowMenu: (e: MouseEvent, peerId: string) => void;
}

export default function ConversationList({ peers, threads, active, verified, unread, pinned, muted, onSelect, onRowMenu }: Props) {
  const [q, setQ] = useState("");

  const filtered = peers
    .filter((p) => `${p.name ?? ""} ${p.peer_id}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (pinned.has(b.peer_id) ? 1 : 0) - (pinned.has(a.peer_id) ? 1 : 0));

  function preview(peerId: string): string {
    const arr = threads[peerId];
    const last = arr && arr.length ? arr[arr.length - 1] : undefined;
    if (!last) return "—";
    if (last.file) return `${last.outgoing ? "Envoyé" : "Reçu"} · ${last.file.name}`;
    return (last.outgoing ? "Vous : " : "") + last.text;
  }

  return (
    <div className="col-list">
      <div className="list-head">
        <h2>Messages</h2>
        <div className="search">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un pair…" />
        </div>
      </div>
      <div className="list-scroll">
        {filtered.length === 0 && (
          <div className="list-empty">
            Aucun pair pour l'instant. Va dans <b>Réseau</b> ou <b>Accueil</b> pour ajouter un
            contact par son adresse .onion.
          </div>
        )}
        {filtered.map((p) => (
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
                {verified[p.peer_id] && <Check size={13} className="vcheck" />}
                {muted.has(p.peer_id) && <BellOff size={12} className="muted-ic" />}
                {p.transport === "tor" && <span className="badge tor">tor</span>}
              </span>
              <span className="row-sub">{preview(p.peer_id)}</span>
            </span>
            {unread[p.peer_id] > 0 && !muted.has(p.peer_id) && <span className="unread">{unread[p.peer_id]}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
