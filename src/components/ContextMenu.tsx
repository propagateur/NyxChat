import { useEffect, type CSSProperties } from "react";

export interface CtxItem {
  label: string;
  danger?: boolean;
  onClick: () => void;
}

interface Props {
  x: number;
  y: number;
  items: CtxItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  useEffect(() => {
    const close = () => onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const style: CSSProperties = {
    left: Math.min(x, window.innerWidth - 210),
    top: Math.min(y, window.innerHeight - items.length * 40 - 12),
  };

  return (
    <div className="ctx" style={style} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) => (
        <button
          key={i}
          className={"ctx-item" + (it.danger ? " danger" : "")}
          onClick={() => {
            it.onClick();
            onClose();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
