import type { Accent } from "./types";

export const ACCENTS: { id: Accent; label: string; color: string }[] = [
  { id: "lune", label: "Lune", color: "#57e0c4" },
  { id: "or", label: "Or", color: "#e6b450" },
  { id: "iris", label: "Iris", color: "#8e9bff" },
  { id: "rose", label: "Rose", color: "#ff8aa6" },
];

export function loadAccent(): Accent {
  const a = localStorage.getItem("nyx.accent") as Accent | null;
  return a && ACCENTS.some((x) => x.id === a) ? a : "lune";
}

export function applyAccent(a: Accent) {
  const root = document.documentElement;
  if (a === "lune") root.removeAttribute("data-accent");
  else root.setAttribute("data-accent", a);
  localStorage.setItem("nyx.accent", a);
}

export type Theme = "dark" | "light";

export function loadTheme(): Theme {
  return localStorage.getItem("nyx.theme") === "light" ? "light" : "dark";
}

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "light") root.setAttribute("data-theme", "light");
  else root.removeAttribute("data-theme");
  localStorage.setItem("nyx.theme", t);
}

export function loadBool(key: string, def = false): boolean {
  const v = localStorage.getItem(key);
  return v === null ? def : v === "1";
}

export function saveBool(key: string, val: boolean) {
  localStorage.setItem(key, val ? "1" : "0");
}
