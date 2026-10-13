/**
 * Pickup bell.
 *
 * A small Web Audio chime — no audio asset to ship, so it works
 * offline and costs nothing to load. Two strikes ("ding-ding")
 * built from a fundamental plus inharmonic partials with an
 * exponential decay, so it rings like a counter bell rather than
 * a flat beep.
 *
 * Browsers only allow audio after a user gesture; the context is
 * created lazily and resumed on every play. That is fine here
 * because the student has already interacted with the page long
 * before any order can become Ready.
 */

let audioContext = null;

function getContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

/** One bell strike at time `t` (seconds on the context clock). */
function strike(ctx, t) {
  // Fundamental and partials (Hz, relative loudness). The inharmonic
  // ratios are what make it sound like metal, not a pure tone.
  const partials = [
    [880, 1.0],
    [1760, 0.55],
    [2437, 0.35],
    [3520, 0.2],
    [4699, 0.1],
  ];

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.22, t);
  master.connect(ctx.destination);

  for (const [freq, amp] of partials) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(amp, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 1.5);
  }
}

/** Ring the pickup bell: a bright two-strike chime. */
export function playBell() {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  strike(ctx, now);
  strike(ctx, now + 0.35);
}
