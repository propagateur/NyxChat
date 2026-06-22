import { useState } from "react";
import type { Accent, Identity } from "../types";
import { ACCENTS } from "../theme";
import { Check } from "../icons";

interface Props {
  me: Identity | null;
  accent: Accent;
  onRename: (name: string) => void;
  onAccent: (a: Accent) => void;
}

export default function SettingsView({ me, accent, onRename, onAccent }: Props) {
  const [name, setName] = useState(me?.name ?? "");

  return (
    <div className="settings view">
      <h1>Réglages</h1>

      <div className="field">
        <label>Nom affiché</label>
        <input
          className="text"
          value={name}
          maxLength={32}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && onRename(name.trim())}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onRename(name.trim())}
        />
      </div>

      <div className="field">
        <label>Couleur d'accent</label>
        <div className="accents">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              className={"swatch" + (accent === a.id ? " sel" : "")}
              onClick={() => onAccent(a.id)}
              title={a.label}
            >
              <span className="ring" style={{ background: a.color }} />
              {accent === a.id && <Check size={14} />}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Identité</label>
        <div className="about" style={{ borderTop: "none", paddingTop: 0 }}>
          Empreinte : <code>{me?.fingerprint ?? "…"}</code>
          <br />
          Adresse Tor : <code>{me?.onion || "en cours de publication…"}</code>
        </div>
      </div>

      <div className="about">
        <b>NyxChat</b> — messagerie pair-à-pair chiffrée de bout en bout. Pas de serveur,
        pas de compte : ton identité est une paire de clés sur cette machine.
        <br />
        Réseau local via libp2p (mDNS) · Internet via services onion Tor · appels WebRTC.
        <br />
        Aucun historique de messages n'est écrit sur le disque.
      </div>
    </div>
  );
}
