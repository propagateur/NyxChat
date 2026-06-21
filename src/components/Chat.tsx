import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage, Peer } from "../types";
import { FileDoc, Moon, Paperclip, Phone, ShieldCheck, Video } from "../icons";

interface Props {
  peer: Peer | null;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onSendFile: () => void;
  onCall: (video: boolean) => void;
  inCall: boolean;
}

export default function Chat({ peer, messages, onSend, onSendFile, onCall, inCall }: Props) {
  const [text, setText] = useState("");
  const [showFp, setShowFp] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => setShowFp(false), [peer?.peer_id]);

  if (!peer) {
    return (
      <main className="chat empty">
        <div className="welcome">
          <Moon size={46} className="mark" />
          <h1>NyxChat</h1>
          <p>Sélectionne un pair pour démarrer une conversation chiffrée de bout en bout.</p>
        </div>
      </main>
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  }

  const canSend = peer.fingerprint !== null; // clé échangée = on peut chiffrer
  const canCall = canSend && peer.online && !inCall;

  return (
    <main className="chat">
      <header className="chat-head">
        <span className="avatar">{initial(peer.name)}</span>
        <div className="chat-head-text">
          <div className="chat-title">{peer.name ?? "Pair inconnu"}</div>
          <div className={"chat-status" + (peer.online ? " on" : "")}>
            {peer.online ? "en ligne · chiffré" : "hors ligne"}
          </div>
        </div>
        <div className="head-actions">
          <button className="icon-btn" onClick={() => onCall(false)} disabled={!canCall} title="Appel audio">
            <Phone />
          </button>
          <button className="icon-btn" onClick={() => onCall(true)} disabled={!canCall} title="Appel vidéo">
            <Video />
          </button>
          <button className="icon-btn" onClick={() => setShowFp((v) => !v)} title="Vérifier l'identité">
            <ShieldCheck />
          </button>
        </div>
      </header>

      {showFp && (
        <div className="fp-panel">
          <p>
            Comparez cette empreinte avec votre interlocuteur via un canal de confiance
            (en personne, par téléphone…). Si elle correspond des deux côtés, personne ne
            peut s'intercaler dans la conversation.
          </p>
          <code>{peer.fingerprint ?? "en attente de la clé…"}</code>
        </div>
      )}

      <div className="messages">
        {messages.length === 0 && <div className="no-msg">Aucun message pour l'instant.</div>}
        {messages.map((m, i) => (
          <div key={i} className={"bubble" + (m.outgoing ? " out" : " in") + (m.failed ? " failed" : "")}>
            {m.file ? (
              <span className="file-card" title={m.file.path ?? m.file.name}>
                <span className="file-ic">
                  <FileDoc size={19} />
                </span>
                <span className="file-info">
                  <span className="file-name">{m.file.name}</span>
                  <span className="file-sub">
                    {formatSize(m.file.size)}
                    {m.outgoing ? " · envoyé" : " · reçu → Téléchargements"}
                  </span>
                </span>
              </span>
            ) : (
              <span className="bubble-text">{m.text}</span>
            )}
            <span className="bubble-meta">
              {m.failed && <span className="warn">non envoyé · </span>}
              {formatTime(m.ts)}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={submit}>
        <button
          type="button"
          className="attach"
          onClick={onSendFile}
          disabled={!canSend}
          title="Envoyer un fichier chiffré"
        >
          <Paperclip />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={canSend ? `Message à ${peer.name ?? "ce pair"}…` : "Échange de clé en cours…"}
          disabled={!canSend}
        />
        <button type="submit" className="send" disabled={!canSend || !text.trim()}>
          Envoyer
        </button>
      </form>
    </main>
  );
}

function initial(name?: string | null) {
  const c = (name ?? "").trim().charAt(0).toUpperCase();
  return c || "?";
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
