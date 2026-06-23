// Notification sounds, synthesized with the Web Audio API so there are no
// audio files to ship, license or load. A short chime for messages and a
// looping two-burst ring for incoming calls. Can be muted in Settings.

let ctx: AudioContext | null = null;
let ringTimer: number | null = null;

export function soundsEnabled(): boolean {
  return localStorage.getItem("nyx.sounds") !== "off"; // on by default
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

// One enveloped tone, scheduled at `at` seconds on the context clock.
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

// Soft two-note chime for a new message / file.
export function playMessage() {
  if (!soundsEnabled()) return;
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.01;
  tone(c, 880, t, 0.16, 0.13);
  tone(c, 1318.5, t + 0.11, 0.22, 0.15);
}

// Warbling double-burst, like a phone ring.
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

// Start ringing for an incoming call until stopped.
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
