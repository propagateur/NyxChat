import { useState, type FormEvent } from "react";
import type { Identity, Peer } from "../types";
import { Moon } from "../icons";

interface Props {
  me: Identity | null;
  peers: Peer[];
  active: string | null;
  onSelect: (peerId: string) => void;
  onRename: (name: string) => void;
  onConnectOnion: (onion: string) => void;
}

export default function Sidebar({ me, peers, active, onSelect, onRename, onConnectOnion }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [onionDraft, setOnionDraft] = useState("");

  function addOnion(e: FormEvent) {
    e.preventDefault();
    const v = onionDraft.trim();
    if (v) onConnectOnion(v);
    setOnionDraft("");
  }

  function startEdit() {
    setDraft(me?.name ?? "");
    setEditing(true);
  }

  function commit() {
    const n = draft.trim();
    if (n && n !== me?.name) onRename(n);
    setEditing(false);
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <Moon size={20} />
        NyxChat
      </div>

      <div className="me">
        <span className="avatar lg">{initial(me?.name)}</span>
        <div className="me-text">
          {editing ? (
            <input
              className="name-input"
              autoFocus
              value={draft}
              maxLength={32}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setEditing(false);
              }}
            />
          ) : (
            <button className="me-name" onClick={startEdit} title="Cliquer pour renommer">
              {me?.name ?? "…"}
            </button>
          )}
          <div className="me-fp" title="Votre empreinte de clé publique">
            {me?.fingerprint ?? ""}
          </div>
          {me?.onion ? (
            <button
              className="onion"
              title={"Cliquer pour copier votre adresse :\n" + me.onion}
              onClick={() => navigator.clipboard.writeText(me.onion)}
            >
              {me.onion.slice(0, 14)}…onion · copier
            </button>
          ) : (
            <div className="onion pending">démarrage de Tor…</div>
          )}
        </div>
      </div>

      <div className="peers-head">Pairs sur le réseau</div>
      <div className="peers">
        {peers.length === 0 && (
          <div className="empty-peers">
            Aucun pair détecté.
            <small>Lance NyxChat sur un autre appareil du même réseau local.</small>
          </div>
        )}
        {peers.map((p) => (
          <button
            key={p.peer_id}
            className={"peer" + (p.peer_id === active ? " active" : "")}
            onClick={() => onSelect(p.peer_id)}
          >
            <span className="avatar">
              {initial(p.name)}
              <span className={"presence" + (p.online ? " on" : "")} />
            </span>
            <span className="peer-text">
              <span className="peer-name">
                {p.name ?? shortId(p.peer_id)}
                {p.transport === "tor" && <span className="badge">tor</span>}
              </span>
              <span className="peer-fp">{p.fingerprint ?? "échange de clé…"}</span>
            </span>
          </button>
        ))}
      </div>

      <form className="add-onion" onSubmit={addOnion}>
        <input
          value={onionDraft}
          onChange={(e) => setOnionDraft(e.target.value)}
          placeholder="ajouter via une adresse .onion"
        />
        <button type="submit" disabled={!onionDraft.trim()} title="Se connecter via Tor">
          +
        </button>
      </form>

      <div className="foot">Chiffré de bout en bout · sans serveur</div>
    </aside>
  );
}

function initial(name?: string | null) {
  const c = (name ?? "").trim().charAt(0).toUpperCase();
  return c || "?";
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}
