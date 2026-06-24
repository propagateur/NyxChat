import { useState } from "react";
import type { Peer } from "../types";
import { avatarStyle, initial, shortId } from "../util";
import { Check, Users, X } from "../icons";
import { useTranslation } from "../i18n";

interface Props {
  peers: Peer[];
  onClose: () => void;
  onCreate: (name: string, memberIds: string[]) => void;
}

export default function NewGroup({ peers, onClose, onCreate }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());

  const eligible = peers.filter((p) => p.fingerprint && p.key);

  function toggle(key: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  const canCreate = name.trim().length > 0 && sel.size > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-ic">
            <Users size={18} />
          </span>
          <h3>{t("group.new")}</h3>
          <button className="modal-x" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <input
            className="text"
            autoFocus
            value={name}
            maxLength={40}
            placeholder={t("group.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="pick-label">
            {t("group.pickMembers")}
            {sel.size > 0 && <span className="pick-count">{sel.size}</span>}
          </div>
          {eligible.length === 0 ? (
            <p className="hint">{t("group.noContacts")}</p>
          ) : (
            <div className="pick-list">
              {eligible.map((p) => (
                <button
                  key={p.peer_id}
                  className={"pick-row" + (sel.has(p.key!) ? " on" : "")}
                  onClick={() => toggle(p.key!)}
                >
                  <span className="avatar sm" style={avatarStyle(p.peer_id)}>
                    {initial(p.name)}
                  </span>
                  <span className="pick-name">{p.name ?? shortId(p.peer_id)}</span>
                  <span className="pick-check">{sel.has(p.key!) && <Check size={13} />}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>{t("chat.cancel")}</button>
          <button className="btn primary" disabled={!canCreate} onClick={() => onCreate(name.trim(), [...sel])}>
            {t("group.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
