import { useRef, useState, type KeyboardEvent } from "react";
import { Mic, Paperclip, PhoneDown, Send, Smile } from "../icons";
import { useTranslation } from "../i18n";

interface Props {
  disabled: boolean;
  placeholder: string;
  onSend: (text: string) => void;
  onSendFile: () => void;
  onSendVoice: (bytes: number[], ext: string) => void;
}

const EMOJIS = [
  "😀", "😂", "🥹", "😉", "😍", "😎", "🤩", "😘",
  "🤗", "🤔", "😴", "😇", "🙃", "😅", "😭", "😡",
  "👍", "👎", "🙏", "👏", "🙌", "💪", "🤝", "👋",
  "🔥", "✨", "🎉", "❤️", "🧡", "💜", "💙", "🖤",
  "⭐", "🌙", "🚀", "✅", "❌", "⚠️", "💡", "🔒",
  "🔑", "👀", "🥳", "😏", "🤫", "📎", "📁", "💬",
];

export default function Composer({ disabled, placeholder, onSend, onSendFile, onSendVoice }: Props) {
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const { t } = useTranslation();

  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const cancelled = useRef(false);

  function send() {
    const body = text.trim();
    if (!body) return;
    onSend(body);
    setText("");
    setEmoji(false);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      cancelled.current = false;
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (cancelled.current) return;
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        const buf = new Uint8Array(await blob.arrayBuffer());
        onSendVoice(Array.from(buf), "webm");
      };
      mr.start();
      rec.current = mr;
      setRecording(true);
      setSecs(0);
      timer.current = window.setInterval(() => setSecs((s) => s + 1), 1000);
    } catch (e) {
      alert(t("composer.micBlocked") + e);
    }
  }

  function stopRec(sendIt: boolean) {
    window.clearInterval(timer.current);
    cancelled.current = !sendIt;
    rec.current?.stop();
    rec.current = null;
    setRecording(false);
  }

  if (recording) {
    return (
      <div className="composer recording">
        <span className="rec-dot" />
        <span className="rec-time">{fmt(secs)}</span>
        <span className="rec-label">{t("composer.recording")}</span>
        <button type="button" className="c-btn" onClick={() => stopRec(false)} title={t("chat.cancel")}>
          <PhoneDown />
        </button>
        <button type="button" className="c-btn c-send" onClick={() => stopRec(true)} title={t("composer.send")}>
          <Send />
        </button>
      </div>
    );
  }

  return (
    <div className="composer">
      <button type="button" className="c-btn" disabled={disabled} onClick={() => setEmoji((v) => !v)} title="Emoji">
        <Smile />
      </button>
      <button type="button" className="c-btn" disabled={disabled} onClick={onSendFile} title={t("composer.sendEncryptedFile")}>
        <Paperclip />
      </button>

      <textarea rows={1} value={text} disabled={disabled} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />

      {text.trim() ? (
        <button type="button" className="c-btn c-send" disabled={disabled} onClick={send} title={t("composer.send")}>
          <Send />
        </button>
      ) : (
        <button type="button" className="c-btn" disabled={disabled} onClick={startRec} title={t("composer.voice")}>
          <Mic />
        </button>
      )}

      {emoji && (
        <div className="emoji-pop">
          {EMOJIS.map((e, i) => (
            <button key={i} type="button" onClick={() => { setText((value) => value + e); setEmoji(false); }}>
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
