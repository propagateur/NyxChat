import { useState } from "react";
import type { Accent, Identity } from "../types";
import type { Theme } from "../theme";
import { ACCENTS } from "../theme";
import { Check } from "../icons";

interface Props {
  me: Identity | null;
  accent: Accent;
  theme: Theme;
  keepHistory: boolean;
  onRename: (name: string) => void;
  onAccent: (a: Accent) => void;
  onTheme: (t: Theme) => void;
  onKeepHistory: (v: boolean) => void;
}

export default function SettingsView({ me, accent, theme, keepHistory, onRename, onAccent, onTheme, onKeepHistory }: Props) {
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
        <label>Apparence</label>
        <div className="seg">
          <button className={theme === "dark" ? "on" : ""} onClick={() => onTheme("dark")}>Sombre</button>
          <button className={theme === "light" ? "on" : ""} onClick={() => onTheme("light")}>Clair</button>
        </div>
      </div>

      <div className="field">
        <label>Couleur d'accent</label>
        <div className="accents">
          {ACCENTS.map((a) => (
            <button key={a.id} className={"swatch" + (accent === a.id ? " sel" : "")} onClick={() => onAccent(a.id)} title={a.label}>
              <span className="ring" style={{ background: a.color }} />
              {accent === a.id && <Check size={14} />}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Confidentialité</label>
        <button className={"toggle" + (keepHistory ? " on" : "")} onClick={() => onKeepHistory(!keepHistory)}>
          <span className="knob" />
          <span>Conserver l'historique des conversations</span>
        </button>
        <p className="hint" style={{ marginTop: 8 }}>
          {keepHistory
            ? "L'historique est gardé localement sur cet appareil (chiffré uniquement sur le réseau)."
            : "Par défaut, aucun message n'est conservé : tout disparaît à la fermeture."}
        </p>
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
        <b>NyxChat</b> — messagerie pair-à-pair chiffrée de bout en bout. Pas de serveur, pas de
        compte. Réseau local via libp2p · Internet via services onion Tor · appels WebRTC.
      </div>
    </div>
  );
}
