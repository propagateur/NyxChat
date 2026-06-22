import { useState, type FormEvent } from "react";
import type { Identity, Peer } from "../types";
import { Copy, Globe, Lock, Plus } from "../icons";
import Qr from "./Qr";

interface Props {
  me: Identity | null;
  peers: Peer[];
  onConnectOnion: (onion: string) => void;
}

export default function Home({ me, peers, onConnectOnion }: Props) {
  const [onion, setOnion] = useState("");
  const online = peers.filter((p) => p.online).length;

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = onion.trim();
    if (v) onConnectOnion(v);
    setOnion("");
  }

  return (
    <div className="home view">
      <div className="home-head">
        <h1>Bonsoir{me ? `, ${me.name}` : ""}</h1>
        <span>ton espace pair-à-pair, chiffré et sans serveur</span>
      </div>

      <div className="bento">
        <section className="card identity">
          <h3>Ton identité</h3>
          <Qr text={me?.onion ?? ""} />
          <div className="who">{me?.name ?? "…"}</div>
          {me?.onion ? (
            <>
              <div className="onion">{me.onion}</div>
              <button className="copy-btn" onClick={() => navigator.clipboard.writeText(me.onion)}>
                <Copy size={15} /> Copier mon adresse
              </button>
            </>
          ) : (
            <div className="onion">Tor démarre… ton adresse arrive.</div>
          )}
          <div className="fp">{me?.fingerprint}</div>
        </section>

        <section className="card">
          <h3>Tor</h3>
          <div className="stat">
            <span className="stat-ic">
              <Globe size={20} />
            </span>
            <div>
              <div className="stat-val">{me?.onion ? "Actif" : "Démarrage"}</div>
              <div className="stat-lbl">joignable depuis Internet</div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <span className={"pill" + (me?.onion ? "" : " off")}>
              <span className="led" />
              {me?.onion ? "service onion publié" : "amorçage du réseau Tor"}
            </span>
          </div>
        </section>

        <section className="card">
          <h3>Réseau local</h3>
          <div className="stat">
            <span className="stat-ic">{online}</span>
            <div>
              <div className="stat-val">{online === 0 ? "Aucun" : online} pair{online > 1 ? "s" : ""}</div>
              <div className="stat-lbl">en ligne autour de toi</div>
            </div>
          </div>
        </section>

        <section className="card">
          <h3>Chiffrement</h3>
          <div className="stat">
            <span className="stat-ic">
              <Lock size={20} />
            </span>
            <div>
              <div className="stat-val">E2E</div>
              <div className="stat-lbl">X25519 · XSalsa20-Poly1305</div>
            </div>
          </div>
        </section>

        <section className="card add">
          <h3>Ajouter un contact</h3>
          <form className="onion-form" onSubmit={submit}>
            <input
              value={onion}
              onChange={(e) => setOnion(e.target.value)}
              placeholder="colle une adresse .onion (ex : abcd…id.onion)"
            />
            <button type="submit" disabled={!onion.trim()}>
              <Plus size={16} />
            </button>
          </form>
          <p className="hint">
            Partage ton adresse (QR ou copier) à un ami, ou colle la sienne ici : vous
            communiquerez à travers Tor, où que vous soyez. Sur le même réseau, les pairs
            apparaissent automatiquement.
          </p>
        </section>
      </div>
    </div>
  );
}
