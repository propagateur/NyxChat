import type { ReactNode } from "react";
import type { View } from "../types";
import { Globe, Home, Message, Moon, Settings } from "../icons";

interface Props {
  view: View;
  onView: (v: View) => void;
  unreadCount: number;
}

export default function Rail({ view, onView, unreadCount }: Props) {
  const items: { id: View; icon: ReactNode; label: string }[] = [
    { id: "home", icon: <Home />, label: "Accueil" },
    { id: "messages", icon: <Message />, label: "Messages" },
    { id: "network", icon: <Globe />, label: "Réseau" },
  ];

  return (
    <nav className="rail">
      <div className="rail-mark">
        <Moon size={24} />
      </div>
      {items.map((it) => (
        <button
          key={it.id}
          className={"rail-btn" + (view === it.id ? " active" : "")}
          onClick={() => onView(it.id)}
          title={it.label}
        >
          {it.icon}
          {it.id === "messages" && unreadCount > 0 && (
            <span className="count-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
          )}
        </button>
      ))}
      <div className="rail-spacer" />
      <button
        className={"rail-btn" + (view === "settings" ? " active" : "")}
        onClick={() => onView("settings")}
        title="Réglages"
      >
        <Settings />
      </button>
    </nav>
  );
}
