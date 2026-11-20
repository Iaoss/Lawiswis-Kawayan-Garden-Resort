// Soft interface sounds, made in the browser (no sound files to download).
// Used only for new notifications and the dark/light switch, never for
// ordinary clicks. Staff can turn them off in Settings → Sound alerts.

let context = null;

// One shared audio context. Browsers keep it silent until the person has
// clicked or typed on the page at least once.
function audio() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return null;
    if (!context || context.state === 'closed') context = new Audio();
    if (context.state === 'suspended') context.resume().catch(() => {});
    return context;
  } catch {
    return null;
  }
}

// One soft note: a quick fade-in, then a long gentle fade-out.
function note(ctx, { frequency, start = 0, length = 0.35, volume = 0.08, type = 'sine' }) {
  const t = ctx.currentTime + start;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(t);
  oscillator.stop(t + length + 0.02);
}

// New notification: two rising glassy notes.
export function playNotificationSound() {
  const ctx = audio();
  if (!ctx) return;
  try {
    note(ctx, { frequency: 1318.5, length: 0.32, volume: 0.07 }); // E6
    note(ctx, { frequency: 1975.5, start: 0.09, length: 0.45, volume: 0.055 }); // B6
    note(ctx, { frequency: 659.25, length: 0.4, volume: 0.03, type: 'triangle' }); // soft body
  } catch {
    // Audio not allowed yet.
  }
}

// Dark / light switch: a short soft click, lower for dark and brighter for light.
export function playThemeSound(toDark) {
  const ctx = audio();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(toDark ? 520 : 760, t);
    oscillator.frequency.exponentialRampToValueAtTime(toDark ? 300 : 1100, t + 0.09);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.09, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(t);
    oscillator.stop(t + 0.16);
  } catch {
    // Audio not allowed yet.
  }
}
