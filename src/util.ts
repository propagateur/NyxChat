export function initial(name?: string | null) {
  const c = (name ?? "").trim().charAt(0).toUpperCase();
  return c || "?";
}

export function shortId(id: string) {
  return id.length > 14 ? `${id.slice(0, 7)}…${id.slice(-4)}` : id;
}

export function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function sameDay(a: number, b: number) {
  const da = new Date(a);
  const db = new Date(b);
  return da.toDateString() === db.toDateString();
}

export function formatDay(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === yest.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

// Découpe un texte en segments texte/lien pour rendre les URL cliquables.
export function linkify(text: string): { url: string | null; value: string }[] {
  const re = /(https?:\/\/[^\s]+)/g;
  const out: { url: string | null; value: string }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ url: null, value: text.slice(last, m.index) });
    out.push({ url: m[0], value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ url: null, value: text.slice(last) });
  return out;
}
