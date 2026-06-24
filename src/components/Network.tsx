import { useState, type FormEvent } from "react";
import type { Peer } from "../types";
import { avatarStyle, initial, shortId } from "../util";
import { Check, Message, Plus, ShieldCheck } from "../icons";
import { useTranslation } from "../i18n";

interface Props {
  peers: Peer[];
  verified: Record<string, string>;
  onConnectOnion: (onion: string) => void;
  onVerify: (peerId: string) => void;
  onOpenChat: (peerId: string) => void;
}

export default function Network({ peers, verified, onConnectOnion, onVerify, onOpenChat }: Props) {
  const [onion, setOnion] = useState("");
  const { t } = useTranslation();

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = onion.trim();
    if (v) onConnectOnion(v);
    setOnion("");
  }

  return (
    <div className="home view">
      <div className="home-head">
        <h1>{t("network.title")}</h1>
        <span>{t("network.subtitle")}</span>
      </div>

      <form className="onion-form" style={{ maxWidth: 560, marginBottom: 26 }} onSubmit={submit}>
        <input
          value={onion}
          onChange={(e) => setOnion(e.target.value)}
          placeholder={t("network.placeholder")}
        />
        <button type="submit" disabled={!onion.trim()}>
          <Plus size={16} />
        </button>
      </form>

      {peers.length === 0 ? (
        <p className="hint" style={{ maxWidth: 520 }}>
          {t("network.empty")}
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
                    {verified[p.peer_id] === p.fingerprint && <Check size={13} className="vcheck" />}
                    <span className={"badge" + (p.transport === "tor" ? " tor" : "")}>
                      {p.transport === "tor" ? "tor" : "lan"}
                    </span>
                  </span>
                  <span className="row-sub">{p.fingerprint ?? t("network.keyExchange")}</span>
                </span>
              </div>
              <div className="fp-actions" style={{ marginTop: 14 }}>
                <button className="btn" onClick={() => onOpenChat(p.peer_id)}>
                  <Message size={15} /> {t("network.message")}
                </button>
                <button
                  className={"btn" + (verified[p.peer_id] === p.fingerprint ? " primary" : "")}
                  onClick={() => onVerify(p.peer_id)}
                  disabled={!p.fingerprint}
                  title={t("network.verifyTitle")}
                >
                  <ShieldCheck size={15} /> {verified[p.peer_id] === p.fingerprint ? t("network.verified") : t("network.verify")}
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
