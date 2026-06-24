export function initial(name?: string | null) {
  const c = (name ?? "").trim().charAt(0).toUpperCase();
  return c || "?";
}

export function avatarStyle(id: string): { background: string } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return { background: `linear-gradient(152deg, hsl(${h} 36% 52%), hsl(${(h + 28) % 360} 40% 38%))` };
}

const IMG = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg"];
const AUDIO = ["webm", "ogg", "oga", "mp3", "m4a", "wav", "opus"];

function ext(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}
export const isImage = (name: string) => IMG.includes(ext(name));
export const isAudio = (name: string) => AUDIO.includes(ext(name));

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
