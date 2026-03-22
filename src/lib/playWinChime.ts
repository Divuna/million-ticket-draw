/**
 * Short layered chime for win moments (Web Audio API — no asset files).
 * Skipped when user prefers reduced motion (common a11y pairing).
 */
export function playWinChime(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch {
    /* ignore */
  }

  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    void ctx.resume();

    // Premium-ish major arpeggio + sparkle (C5 → E5 → G5 → C6)
    const freqs = [523.25, 659.25, 783.99, 1046.5];
    const stagger = 0.07;
    const peak = 0.11;

    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i === freqs.length - 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);

      const t0 = ctx.currentTime + i * stagger;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(peak, t0 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.42);

      osc.start(t0);
      osc.stop(t0 + 0.48);
    });

    // Premium lift: bright high “ding” (E6 → G6)
    const tHi = ctx.currentTime + 0.34;
    const hiOsc = ctx.createOscillator();
    const hiGain = ctx.createGain();
    hiOsc.type = 'sine';
    hiOsc.frequency.setValueAtTime(1318.51, tHi); // E6
    hiOsc.frequency.linearRampToValueAtTime(1661.22, tHi + 0.11); // ~G6 lift
    hiOsc.connect(hiGain);
    hiGain.connect(ctx.destination);
    hiGain.gain.setValueAtTime(0, tHi);
    hiGain.gain.linearRampToValueAtTime(0.09, tHi + 0.018);
    hiGain.gain.exponentialRampToValueAtTime(0.0008, tHi + 0.28);
    hiOsc.start(tHi);
    hiOsc.stop(tHi + 0.32);

    // Subtle "body" tone (same chord, softer, slightly delayed)
    const bass = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(130.81, ctx.currentTime); // C3
    bass.connect(bassGain);
    bassGain.connect(ctx.destination);
    const tb = ctx.currentTime + 0.02;
    bassGain.gain.setValueAtTime(0, tb);
    bassGain.gain.linearRampToValueAtTime(0.06, tb + 0.05);
    bassGain.gain.exponentialRampToValueAtTime(0.0008, tb + 0.55);
    bass.start(tb);
    bass.stop(tb + 0.6);

    window.setTimeout(() => {
      try {
        void ctx.close();
      } catch {
        /* ignore */
      }
    }, 1050);
  } catch {
    /* autoplay or API blocked */
  }
}
