import { useState } from "react";
import type { ChatMessage, Peer } from "../types";
import { initial, shortId } from "../util";
import { Check, Search } from "../icons";

interface Props {
  peers: Peer[];
  threads: Record<string, ChatMessage[]>;
  active: string | null;
  verified: Record<string, boolean>;
  onSelect: (peerId: string) => void;
}

export default function ConversationList({ peers, threads, active, verified, onSelect }: Props) {
  const [q, setQ] = useState("");

  const filtered = peers.filter((p) => {
    const hay = `${p.name ?? ""} ${p.peer_id}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

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
          >
            <span className="avatar tinted">
              {initial(p.name)}
              <span className={"presence" + (p.online ? " on" : "")} />
            </span>
            <span className="row-text">
              <span className="row-name">
                {p.name ?? shortId(p.peer_id)}
                {verified[p.peer_id] && <Check size={13} className="vcheck" />}
                {p.transport === "tor" && <span className="badge tor">tor</span>}
              </span>
              <span className="row-sub">{preview(p.peer_id)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
