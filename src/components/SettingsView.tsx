import { useState } from "react";
import type { Accent, Identity } from "../types";
import type { Skin, Theme } from "../theme";
import { ACCENTS, SKINS } from "../theme";
import { loadTurn, saveTurn } from "../calls";
import { loadDevices, saveDevices, useMediaDevices, outputSelectable } from "../devices";
import { soundsEnabled, setSounds } from "../sound";
import { Check, Lock, LogOut, ShieldCheck } from "../icons";
import { exportIdentity, importIdentity, pickFile, pickSave } from "../api";
import { useTranslation, LANGS, type Lang } from "../i18n";

interface Props {
  me: Identity | null;
  accent: Accent;
  theme: Theme;
  skin: Skin;
  keepHistory: boolean;
  onRename: (name: string) => void;
  onAccent: (a: Accent) => void;
  onTheme: (t: Theme) => void;
  onSkin: (s: Skin) => void;
  onKeepHistory: (v: boolean) => void;
  onClearHistory: () => void;
}

export default function SettingsView({ me, accent, theme, skin, keepHistory, onRename, onAccent, onTheme, onSkin, onKeepHistory, onClearHistory }: Props) {
  const [name, setName] = useState(me?.name ?? "");
  const [turn, setTurn] = useState(loadTurn);
  const [devicePrefs, setDevicePrefs] = useState(loadDevices);
  const [sounds, setSoundsOn] = useState(soundsEnabled);
  const [status, setStatus] = useState<string | null>(null);
  const { devices, hasLabels, requestAccess } = useMediaDevices();
  const { lang, setLanguage, t } = useTranslation();

  async function doExport() {
    try {
      const dest = await pickSave("nyxchat-identity.nyx");
      if (!dest) return;
      await exportIdentity(dest);
      setStatus(t("settings.exported"));
    } catch (e) {
      setStatus(t("settings.backupError") + e);
    }
  }

  async function doImport() {
    try {
      const src = await pickFile();
      if (!src) return;
      if (!window.confirm(t("settings.importConfirm"))) return;
      await importIdentity(src);
      setStatus(t("settings.imported"));
    } catch (e) {
      setStatus(t("settings.backupError") + e);
    }
  }

  function doClear() {
    onClearHistory();
    setStatus(t("settings.cleared"));
  }

  function updateTurn(patch: Partial<typeof turn>) {
    setTurn((prev) => {
      const next = { ...prev, ...patch };
      saveTurn(next);
      return next;
    });
  }

  function updateDevices(patch: Partial<typeof devicePrefs>) {
    setDevicePrefs((prev) => {
      const next = { ...prev, ...patch };
      saveDevices(next);
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
        <select className="text select" value={lang} onChange={(e) => setLanguage(e.target.value as Lang)}>
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>{t("settings.style")}</label>
        <div className="skin-grid">
          {SKINS.map((s) => (
            <button key={s.id} className={"skin-card" + (skin === s.id ? " sel" : "")} onClick={() => onSkin(s.id)}>
              <span className="skin-prev" style={{ background: s.bg }}>
                <span className="skin-prev-bar" style={{ background: s.panel }} />
                <span className="skin-prev-bubble" style={{ background: s.accent }} />
              </span>
              <span className="skin-meta">
                <span className="skin-name">{s.label}</span>
                <span className="skin-hint">{s.hint}</span>
              </span>
              {skin === s.id && <Check size={15} className="skin-check" />}
            </button>
          ))}
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
        <label>{t("settings.notifications")}</label>
        <button
          className={"toggle" + (sounds ? " on" : "")}
          onClick={() => { const v = !sounds; setSoundsOn(v); setSounds(v); }}
        >
          <span className="knob" />
          <span>{t("settings.sounds")}</span>
        </button>
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
        <label>{t("settings.devices")}</label>
        <div className="device-select">
          <span className="device-label">{t("settings.micInput")}</span>
          <select className="text select" value={devicePrefs.audioIn} onChange={(e) => updateDevices({ audioIn: e.target.value })}>
            <option value="">{t("settings.deviceDefault")}</option>
            {devices.audioIn.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `${t("settings.micInput")} ${i + 1}`}</option>
            ))}
          </select>
        </div>
        <div className="device-select">
          <span className="device-label">{t("settings.cameraInput")}</span>
          <select className="text select" value={devicePrefs.videoIn} onChange={(e) => updateDevices({ videoIn: e.target.value })}>
            <option value="">{t("settings.deviceDefault")}</option>
            {devices.videoIn.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `${t("settings.cameraInput")} ${i + 1}`}</option>
            ))}
          </select>
        </div>
        {outputSelectable && (
          <div className="device-select">
            <span className="device-label">{t("settings.audioOutput")}</span>
            <select className="text select" value={devicePrefs.audioOut} onChange={(e) => updateDevices({ audioOut: e.target.value })}>
              <option value="">{t("settings.deviceDefault")}</option>
              {devices.audioOut.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `${t("settings.audioOutput")} ${i + 1}`}</option>
              ))}
            </select>
          </div>
        )}
        {!hasLabels && (
          <button className="device-enable" onClick={requestAccess}>{t("settings.enableDevices")}</button>
        )}
      </div>

      <div className="field">
        <label>{t("settings.identity")}</label>
        <div className="about" style={{ borderTop: "none", paddingTop: 0 }}>
          {t("settings.fingerprint")} <code>{me?.fingerprint ?? "..."}</code>
          <br />
          {t("settings.torAddress")} <code>{me?.onion || t("settings.publishing")}</code>
        </div>
      </div>

      <div className="field">
        <label>{t("settings.security")}</label>
        <p className="hint" style={{ margin: "0 0 12px" }}>{t("settings.backupHint")}</p>
        <div className="backup-actions">
          <button className="btn" onClick={doExport}>
            <ShieldCheck size={15} /> {t("settings.exportId")}
          </button>
          <button className="btn" onClick={doImport}>
            <Lock size={15} /> {t("settings.importId")}
          </button>
          <button className="btn danger" onClick={doClear}>
            <LogOut size={15} /> {t("settings.clearHistory")}
          </button>
        </div>
        {status && <p className="hint" style={{ marginTop: 10, color: "var(--accent)" }}>{status}</p>}
      </div>

      <div className="about">
        <b>NyxChat</b> — {t("settings.about")}
      </div>
    </div>
  );
}
