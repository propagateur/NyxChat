import { useState, type FormEvent } from "react";
import type { Peer } from "../types";
import { avatarStyle, initial, shortId } from "../util";
import { Check, Message, Plus, ShieldCheck } from "../icons";

interface Props {
  peers: Peer[];
  verified: Record<string, boolean>;
  onConnectOnion: (onion: string) => void;
  onVerify: (peerId: string) => void;
  onOpenChat: (peerId: string) => void;
}

export default function Network({ peers, verified, onConnectOnion, onVerify, onOpenChat }: Props) {
  const [onion, setOnion] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = onion.trim();
    if (v) onConnectOnion(v);
    setOnion("");
  }

  return (
    <div className="home view">
      <div className="home-head">
        <h1>Réseau</h1>
        <span>les pairs joignables — réseau local et Tor</span>
      </div>

      <form className="onion-form" style={{ maxWidth: 560, marginBottom: 26 }} onSubmit={submit}>
        <input
          value={onion}
          onChange={(e) => setOnion(e.target.value)}
          placeholder="ajouter un contact par son adresse .onion"
        />
        <button type="submit" disabled={!onion.trim()}>
          <Plus size={16} />
        </button>
      </form>

      {peers.length === 0 ? (
        <p className="hint" style={{ maxWidth: 520 }}>
          Aucun pair pour l'instant. Sur un même réseau local, les autres NyxChat
          apparaissent tout seuls. À distance, ajoute quelqu'un via son adresse .onion
          ci-dessus.
        </p>
      ) : (
        <div className="bento" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))", maxWidth: 820 }}>
          {peers.map((p) => (
            <section className="card" key={p.peer_id} style={{ padding: 16 }}>
              <div className="row" style={{ padding: 0 }}>
                <span className="avatar" style={avatarStyle(p.peer_id)}>
                  {initial(p.name)}
                  <span className={"presence" + (p.online ? " on" : "")} />
                </span>
                <span className="row-text">
                  <span className="row-name">
                    {p.name ?? shortId(p.peer_id)}
                    {verified[p.peer_id] && <Check size={13} className="vcheck" />}
                    <span className={"badge" + (p.transport === "tor" ? " tor" : "")}>
                      {p.transport === "tor" ? "tor" : "lan"}
                    </span>
                  </span>
                  <span className="row-sub">{p.fingerprint ?? "échange de clé…"}</span>
                </span>
              </div>
              <div className="fp-actions" style={{ marginTop: 14 }}>
                <button className="btn" onClick={() => onOpenChat(p.peer_id)}>
                  <Message size={15} /> Message
                </button>
                <button
                  className={"btn" + (verified[p.peer_id] ? " primary" : "")}
                  onClick={() => onVerify(p.peer_id)}
                  disabled={!p.fingerprint}
                  title="Marquer comme vérifié après avoir comparé l'empreinte"
                >
                  <ShieldCheck size={15} /> {verified[p.peer_id] ? "Vérifié" : "Vérifier"}
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
