import { useState } from "react";
import type { Group, Peer } from "../types";
import { avatarStyle, initial, shortId } from "../util";
import { Check, LogOut, UserPlus, Users, X } from "../icons";
import { useTranslation } from "../i18n";

interface Props {
  group: Group;
  peers: Peer[];
  onClose: () => void;
  onAddMembers: (ids: string[]) => void;
  onLeave: () => void;
}

export default function GroupManage({ group, peers, onClose, onAddMembers, onLeave }: Props) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmLeave, setConfirmLeave] = useState(false);

  const memberSet = new Set(group.members);
  const candidates = peers.filter((p) => p.fingerprint && p.key && !memberSet.has(p.key));
  const count = group.members.length + 1;

  function toggle(key: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  function applyAdd() {
    if (sel.size > 0) onAddMembers([...sel]);
    setSel(new Set());
    setAdding(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="avatar group sm">
            <Users size={16} />
          </span>
          <div className="modal-title">
            <h3>{group.name}</h3>
            <span className="modal-sub">{count} {count > 1 ? t("group.memberCount") : t("group.oneMember")}</span>
          </div>
          <button className="modal-x" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {!adding ? (
            <>
              <div className="pick-label">{t("group.members")}</div>
              <div className="pick-list">
                <div className="pick-row static">
                  <span className="avatar sm you-avatar">★</span>
                  <span className="pick-name">{t("group.you")}</span>
                </div>
                {group.members.map((key) => {
                  const p = peers.find((x) => x.key === key) ?? null;
                  return (
                    <div key={key} className="pick-row static">
                      <span className="avatar sm" style={avatarStyle(p?.peer_id ?? key)}>
                        {initial(p?.name)}
                      </span>
                      <span className="pick-name">{p?.name ?? shortId(key)}</span>
                      {p?.online && <span className="presence on inline" />}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="pick-label">
                {t("group.addMembers")}
                {sel.size > 0 && <span className="pick-count">{sel.size}</span>}
              </div>
              {candidates.length === 0 ? (
                <p className="hint">{t("group.noContacts")}</p>
              ) : (
                <div className="pick-list">
                  {candidates.map((p) => (
                    <button key={p.peer_id} className={"pick-row" + (sel.has(p.key!) ? " on" : "")} onClick={() => toggle(p.key!)}>
                      <span className="avatar sm" style={avatarStyle(p.peer_id)}>
                        {initial(p.name)}
                      </span>
                      <span className="pick-name">{p.name ?? shortId(p.peer_id)}</span>
                      <span className="pick-check">{sel.has(p.key!) && <Check size={13} />}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-foot spread">
          {adding ? (
            <>
              <button className="btn" onClick={() => { setAdding(false); setSel(new Set()); }}>{t("chat.cancel")}</button>
              <button className="btn primary" disabled={sel.size === 0} onClick={applyAdd}>{t("group.addMembers")}</button>
            </>
          ) : (
            <>
              <button className={"btn danger" + (confirmLeave ? " armed" : "")} onClick={() => (confirmLeave ? onLeave() : setConfirmLeave(true))}>
                <LogOut size={15} /> {confirmLeave ? t("group.leaveConfirm") : t("group.leave")}
              </button>
              {group.owner && (
                <button className="btn primary" onClick={() => setAdding(true)}>
                  <UserPlus size={15} /> {t("group.addMembers")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
