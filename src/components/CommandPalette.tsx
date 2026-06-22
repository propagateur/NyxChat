import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { Peer, View } from "../types";
import { initial, shortId } from "../util";
import { Globe, Home, Message, Search, Settings } from "../icons";

interface Item {
  id: string;
  label: string;
  sub?: string;
  icon: ReactNode;
  run: () => void;
}

interface Props {
  peers: Peer[];
  onClose: () => void;
  onNavigate: (v: View) => void;
  onOpenPeer: (peerId: string) => void;
}

export default function CommandPalette({ peers, onClose, onNavigate, onOpenPeer }: Props) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const items = useMemo<Item[]>(() => {
    const nav: Item[] = [
      { id: "home", label: "Accueil", icon: <Home size={16} />, run: () => onNavigate("home") },
      { id: "messages", label: "Messages", icon: <Message size={16} />, run: () => onNavigate("messages") },
      { id: "network", label: "Réseau", icon: <Globe size={16} />, run: () => onNavigate("network") },
      { id: "settings", label: "Réglages", icon: <Settings size={16} />, run: () => onNavigate("settings") },
    ];
    const ppl: Item[] = peers.map((p) => ({
      id: "p:" + p.peer_id,
      label: p.name ?? shortId(p.peer_id),
      sub: "Ouvrir la conversation",
      icon: <span className="avatar tinted" style={{ width: 24, height: 24, borderRadius: 8, fontSize: 11 }}>{initial(p.name)}</span>,
      run: () => onOpenPeer(p.peer_id),
    }));
    return [...nav, ...ppl];
  }, [peers, onNavigate, onOpenPeer]);

  const filtered = items.filter((it) => (it.label + " " + (it.sub ?? "")).toLowerCase().includes(q.toLowerCase()));

  useEffect(() => setSel(0), [q]);

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = filtered[sel];
      if (it) {
        it.run();
        onClose();
      }
    }
  }

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="cmd-input">
          <Search size={18} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Aller à… ou rechercher un pair"
          />
        </div>
        <div className="cmd-list">
          {filtered.length === 0 && <div className="cmd-empty">Aucun résultat</div>}
          {filtered.map((it, i) => (
            <button
              key={it.id}
              className={"cmd-item" + (i === sel ? " sel" : "")}
              onMouseEnter={() => setSel(i)}
              onClick={() => {
                it.run();
                onClose();
              }}
            >
              {it.icon}
              <span style={{ flex: 1 }}>{it.label}</span>
              {it.sub && <span className="k">{it.sub}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
