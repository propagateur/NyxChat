import type { ReactNode } from "react";
import type { View } from "../types";
import { Globe, Home, Message, Moon, Settings } from "../icons";
import { useTranslation } from "../i18n";

interface Props {
  view: View;
  onView: (v: View) => void;
  unreadCount: number;
}

export default function Rail({ view, onView, unreadCount }: Props) {
  const { t } = useTranslation();
  const items: { id: View; icon: ReactNode; label: string }[] = [
    { id: "home", icon: <Home />, label: t("view.home") },
    { id: "messages", icon: <Message />, label: t("view.messages") },
    { id: "network", icon: <Globe />, label: t("view.network") },
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
        title={t("view.settings")}
      >
        <Settings />
      </button>
    </nav>
  );
}
