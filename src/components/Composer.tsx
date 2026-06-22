import { useState, type KeyboardEvent } from "react";
import { Paperclip, Send, Smile } from "../icons";

interface Props {
  disabled: boolean;
  placeholder: string;
  onSend: (text: string) => void;
  onSendFile: () => void;
}

const EMOJIS = [
  "😀", "😂", "🥹", "😉", "😍", "😎", "🤩", "😘",
  "🤗", "🤔", "😴", "😇", "🙃", "😅", "😭", "😡",
  "👍", "👎", "🙏", "👏", "🙌", "💪", "🤝", "👋",
  "🔥", "✨", "🎉", "❤️", "🧡", "💜", "💙", "🖤",
  "⭐", "🌙", "🚀", "✅", "❌", "⚠️", "💡", "🔒",
  "🔑", "👀", "🥳", "😏", "🤫", "📎", "📁", "💬",
];

export default function Composer({ disabled, placeholder, onSend, onSendFile }: Props) {
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState(false);

  function send() {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
    setEmoji(false);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="composer">
      <button
        type="button"
        className="c-btn"
        disabled={disabled}
        onClick={() => setEmoji((v) => !v)}
        title="Emoji"
      >
        <Smile />
      </button>
      <button
        type="button"
        className="c-btn"
        disabled={disabled}
        onClick={onSendFile}
        title="Envoyer un fichier chiffré"
      >
        <Paperclip />
      </button>

      <textarea
        rows={1}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
      />

      <button type="button" className="c-btn c-send" disabled={disabled || !text.trim()} onClick={send} title="Envoyer">
        <Send />
      </button>

      {emoji && (
        <div className="emoji-pop">
          {EMOJIS.map((e, i) => (
            <button key={i} type="button" onClick={() => { setText((t) => t + e); setEmoji(false); }}>
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
