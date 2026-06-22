import { useEffect, useRef } from "react";
import type { ChatMessage, Peer } from "../types";
import { formatDay, formatTime, formatSize, initial, linkify, sameDay } from "../util";
import { FileDoc, Moon, Phone, ShieldCheck, Video } from "../icons";
import Composer from "./Composer";

interface Props {
  peer: Peer | null;
  messages: ChatMessage[];
  verified: boolean;
  inCall: boolean;
  dragging: boolean;
  showFp: boolean;
  onToggleFp: () => void;
  onSend: (text: string) => void;
  onSendFile: () => void;
  onCall: (video: boolean) => void;
  onVerify: () => void;
}

export default function Chat(props: Props) {
  const { peer, messages, verified, inCall, dragging, showFp, onToggleFp, onSend, onSendFile, onCall, onVerify } = props;
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (!peer) {
    return (
      <main className="chat empty">
        <div className="welcome">
          <Moon size={48} className="mark" />
          <h2>Choisis une conversation</h2>
          <p>Sélectionne un pair à gauche, ou ajoute un contact depuis l'Accueil pour démarrer un échange chiffré de bout en bout.</p>
        </div>
      </main>
    );
  }

  const canSend = peer.fingerprint !== null;
  const canCall = canSend && peer.online && !inCall;

  return (
    <main className="chat">
      <header className="chat-head">
        <span className="avatar tinted">
          {initial(peer.name)}
          <span className={"presence" + (peer.online ? " on" : "")} />
        </span>
        <div className="row-text">
          <span className="row-name">
            {peer.name ?? "Pair inconnu"}
            {peer.transport === "tor" && <span className="badge tor">tor</span>}
          </span>
          <span className={"chat-status" + (peer.online ? " on" : "")}>
            {peer.online ? "en ligne · chiffré" : "hors ligne"}
          </span>
        </div>
        <div className="head-actions">
          <button className="icon-btn" disabled={!canCall} onClick={() => onCall(false)} title="Appel audio">
            <Phone />
          </button>
          <button className="icon-btn" disabled={!canCall} onClick={() => onCall(true)} title="Appel vidéo">
            <Video />
          </button>
          <button className={"icon-btn" + (verified ? " on" : "")} onClick={onToggleFp} title="Vérifier l'identité">
            <ShieldCheck />
          </button>
        </div>
      </header>

      {showFp && (
        <div className="fp-panel">
          <p>
            Comparez cette empreinte avec votre interlocuteur par un canal sûr (en personne,
            par téléphone…). Si elle correspond des deux côtés, personne ne peut s'intercaler.
          </p>
          <code>{peer.fingerprint ?? "en attente de la clé…"}</code>
          <div className="fp-actions">
            <button className={"btn" + (verified ? " primary" : "")} disabled={!peer.fingerprint} onClick={onVerify}>
              <ShieldCheck size={15} /> {verified ? "Vérifié" : "Marquer comme vérifié"}
            </button>
          </div>
        </div>
      )}

      <div className="messages">
        {messages.length === 0 && <div className="no-msg">Aucun message. Dites bonjour.</div>}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || !sameDay(prev.ts, m.ts);
          const grouped = !newDay && !!prev && prev.outgoing === m.outgoing && !prev.file && !m.file;
          return (
            <div key={i} style={{ display: "contents" }}>
              {newDay && <div className="day-sep">{formatDay(m.ts)}</div>}
              <div className={"bubble " + (m.outgoing ? "out" : "in") + (grouped ? " grouped" : "") + (m.failed ? " failed" : "")}>
                {m.file ? (
                  <span className="file-card" title={m.file.path ?? m.file.name}>
                    <span className="file-ic">
                      <FileDoc size={19} />
                    </span>
                    <span>
                      <span className="file-name" style={{ display: "block" }}>{m.file.name}</span>
                      <span className="file-sub">
                        {formatSize(m.file.size)}
                        {m.outgoing ? " · envoyé" : " · reçu → Téléchargements"}
                      </span>
                    </span>
                  </span>
                ) : (
                  <span className="bubble-text">
                    {linkify(m.text).map((s, j) =>
                      s.url ? (
                        <span key={j} className="lnk">{s.value}</span>
                      ) : (
                        <span key={j}>{s.value}</span>
                      )
                    )}
                  </span>
                )}
                <span className="bubble-meta">
                  {m.failed && <span className="warn">non envoyé · </span>}
                  {formatTime(m.ts)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <Composer
        disabled={!canSend}
        placeholder={canSend ? `Message à ${peer.name ?? "ce pair"}…` : "Échange de clé en cours…"}
        onSend={onSend}
        onSendFile={onSendFile}
      />

      {dragging && <div className="drop">Déposez un fichier pour l'envoyer chiffré</div>}
    </main>
  );
}
