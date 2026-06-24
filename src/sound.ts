let ctx: AudioContext | null = null;
let ringTimer: number | null = null;

export function soundsEnabled(): boolean {
  return localStorage.getItem("nyx.sounds") !== "off";
}

export function setSounds(on: boolean) {
  localStorage.setItem("nyx.sounds", on ? "on" : "off");
  if (!on) stopRing();
}

function audio(): AudioContext | null {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!ctx) ctx = new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(c: AudioContext, freq: number, at: number, dur: number, peak = 0.16) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

export function playMessage() {
  if (!soundsEnabled()) return;
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.01;
  tone(c, 880, t, 0.16, 0.13);
  tone(c, 1318.5, t + 0.11, 0.22, 0.15);
}

function ringOnce() {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.01;
  for (let i = 0; i < 2; i++) {
    const base = t + i * 0.42;
    tone(c, 1046.5, base, 0.18, 0.17);
    tone(c, 880, base + 0.16, 0.18, 0.17);
  }
}

export function startRing() {
  if (!soundsEnabled() || ringTimer !== null) return;
  ringOnce();
  ringTimer = window.setInterval(ringOnce, 2400);
}

export function stopRing() {
  if (ringTimer !== null) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
}
