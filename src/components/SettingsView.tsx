import { useState } from "react";
import type { Accent, Identity } from "../types";
import type { Theme } from "../theme";
import { ACCENTS } from "../theme";
import { loadTurn, saveTurn } from "../calls";
import { Check } from "../icons";
import { useTranslation } from "../i18n";

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
  const [turn, setTurn] = useState(loadTurn);
  const { lang, setLanguage, t } = useTranslation();

  function updateTurn(patch: Partial<typeof turn>) {
    setTurn((prev) => {
      const next = { ...prev, ...patch };
      saveTurn(next);
      return next;
    });
  }

  return (
    <div className="settings view">
      <h1>{t("settings.title")}</h1>

      <div className="field">
        <label>{t("settings.name")}</label>
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
        <label>{t("settings.language")}</label>
        <div className="seg">
          <button className={lang === "en" ? "on" : ""} onClick={() => setLanguage("en")}>English</button>
          <button className={lang === "fr" ? "on" : ""} onClick={() => setLanguage("fr")}>Francais</button>
        </div>
      </div>

      <div className="field">
        <label>{t("settings.appearance")}</label>
        <div className="seg">
          <button className={theme === "dark" ? "on" : ""} onClick={() => onTheme("dark")}>{t("settings.dark")}</button>
          <button className={theme === "light" ? "on" : ""} onClick={() => onTheme("light")}>{t("settings.light")}</button>
        </div>
      </div>

      <div className="field">
        <label>{t("settings.accent")}</label>
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
        <label>{t("settings.privacy")}</label>
        <button className={"toggle" + (keepHistory ? " on" : "")} onClick={() => onKeepHistory(!keepHistory)}>
          <span className="knob" />
          <span>{t("settings.keepHistory")}</span>
        </button>
        <p className="hint" style={{ marginTop: 8 }}>
          {keepHistory ? t("settings.historyOn") : t("settings.historyOff")}
        </p>
      </div>

      <div className="field">
        <label>{t("settings.calls")}</label>
        <input
          className="text"
          value={turn.url}
          placeholder={t("settings.turnUrlPlaceholder")}
          onChange={(e) => updateTurn({ url: e.target.value })}
        />
        <div className="turn-creds">
          <input
            className="text"
            value={turn.username}
            placeholder={t("settings.turnUser")}
            autoComplete="off"
            onChange={(e) => updateTurn({ username: e.target.value })}
          />
          <input
            className="text"
            type="password"
            value={turn.credential}
            placeholder={t("settings.turnPass")}
            autoComplete="off"
            onChange={(e) => updateTurn({ credential: e.target.value })}
          />
        </div>
        <p className="hint" style={{ marginTop: 8 }}>{t("settings.turnHint")}</p>
      </div>

      <div className="field">
        <label>{t("settings.identity")}</label>
        <div className="about" style={{ borderTop: "none", paddingTop: 0 }}>
          {t("settings.fingerprint")} <code>{me?.fingerprint ?? "..."}</code>
          <br />
          {t("settings.torAddress")} <code>{me?.onion || t("settings.publishing")}</code>
        </div>
      </div>

      <div className="about">
        <b>NyxChat</b> — {t("settings.about")}
      </div>
    </div>
  );
}
