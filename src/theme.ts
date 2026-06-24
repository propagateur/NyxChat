import type { Accent } from "./types";

export const ACCENTS: { id: Accent; label: string; color: string }[] = [
  { id: "lune", label: "Amber", color: "#e0a96d" },
  { id: "or", label: "Sage", color: "#8faa72" },
  { id: "iris", label: "Lilac", color: "#b79bd8" },
  { id: "rose", label: "Clay", color: "#dc8c74" },
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

export type Skin = "nocturne" | "terminal" | "aurore" | "brume";

export const SKINS: { id: Skin; label: string; hint: string; bg: string; panel: string; accent: string }[] = [
  { id: "nocturne", label: "Nocturne", hint: "Encre chaude, serif éditorial", bg: "#12100e", panel: "#1a1613", accent: "#e0a96d" },
  { id: "terminal", label: "Terminal", hint: "Noir & néon, monospace", bg: "#07090a", panel: "#0c1011", accent: "#34e08a" },
  { id: "aurore", label: "Aurore", hint: "Sombre vif, dégradé arrondi", bg: "#0a0b16", panel: "#14162a", accent: "#7c5cff" },
  { id: "brume", label: "Brume", hint: "Ardoise fraîche, épurée", bg: "#0f1216", panel: "#171b21", accent: "#6aa6ff" },
];

export function loadSkin(): Skin {
  const s = localStorage.getItem("nyx.skin") as Skin | null;
  return s && SKINS.some((x) => x.id === s) ? s : "nocturne";
}

export function applySkin(s: Skin) {
  const root = document.documentElement;
  if (s === "nocturne") root.removeAttribute("data-skin");
  else root.setAttribute("data-skin", s);
  localStorage.setItem("nyx.skin", s);
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
