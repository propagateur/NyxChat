import { useState, type FormEvent } from "react";
import type { Identity, Peer } from "../types";
import { Copy, Globe, Lock, Plus } from "../icons";
import { useTranslation } from "../i18n";
import Qr from "./Qr";

interface Props {
  me: Identity | null;
  peers: Peer[];
  onConnectOnion: (onion: string) => void;
}

export default function Home({ me, peers, onConnectOnion }: Props) {
  const [onion, setOnion] = useState("");
  const { t } = useTranslation();
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
        <h1>{t("home.greeting")}{me ? `, ${me.name}` : ""}</h1>
        <span>{t("home.subtitle")}</span>
      </div>

      <div className="bento">
        <section className="card identity">
          <h3>{t("home.identity")}</h3>
          <Qr text={me?.onion ?? ""} />
          <div className="who">{me?.name ?? "..."}</div>
          {me?.onion ? (
            <>
              <div className="onion">{me.onion}</div>
              <button className="copy-btn" onClick={() => navigator.clipboard.writeText(me.onion)}>
                <Copy size={15} /> {t("home.copy")}
              </button>
            </>
          ) : (
            <div className="onion">{t("home.torStarting")}</div>
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
              <div className="stat-val">{me?.onion ? t("home.torActive") : t("home.torBootstrapping")}</div>
              <div className="stat-lbl">{t("home.torReachable")}</div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <span className={"pill" + (me?.onion ? "" : " off")}>
              <span className="led" />
              {me?.onion ? t("home.torPublished") : t("home.torBootstrap")}
            </span>
          </div>
        </section>

        <section className="card">
          <h3>{t("home.localNetwork")}</h3>
          <div className="stat">
            <span className="stat-ic">{online}</span>
            <div>
              <div className="stat-val">{online === 0 ? t("home.noPeers") : online} {online > 1 ? t("home.peers") : t("home.peer")}</div>
              <div className="stat-lbl">{t("home.onlineAround")}</div>
            </div>
          </div>
        </section>

        <section className="card">
          <h3>{t("home.encryption")}</h3>
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
          <h3>{t("home.addContact")}</h3>
          <form className="onion-form" onSubmit={submit}>
            <input
              value={onion}
              onChange={(e) => setOnion(e.target.value)}
              placeholder={t("home.onionPlaceholder")}
            />
            <button type="submit" disabled={!onion.trim()}>
              <Plus size={16} />
            </button>
          </form>
          <p className="hint">{t("home.addHint")}</p>
        </section>
      </div>
    </div>
  );
}
