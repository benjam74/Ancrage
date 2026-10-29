import type { Prefs } from '../app/prefs';

/** Short sounds and vibrations tied to the verdict: brief, informative, and off when the preferences say so. */
export function createFeedback(getPrefs: () => Prefs) {
  let ctx: AudioContext | null = null;

  function tone(freq: number, start: number, length: number, type: OscillatorType, gain: number) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t = ctx.currentTime + start;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }

  function play(notes: [number, number, number][], type: OscillatorType, gain: number) {
    if (!getPrefs().sound) return;
    try {
      ctx ??= new AudioContext();
      if (ctx.state === 'suspended') void ctx.resume();
      for (const [freq, start, length] of notes) tone(freq, start, length, type, gain);
    } catch {
      // No audio on this device: the visual feedback is enough.
    }
  }

  function vibrate(pattern: number | number[]) {
    if (!getPrefs().haptics) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // Not supported (iPhone): nothing to do.
    }
  }

  return {
    /** Two rising notes; a little higher with each answer in a row (capped). */
    correct(combo: number) {
      const lift = 2 ** (Math.min(Math.max(combo - 1, 0), 6) / 12);
      play([[660 * lift, 0, 0.12], [880 * lift, 0.09, 0.2]], 'sine', 0.18);
      vibrate(15);
    },
    wrong() {
      play([[220, 0, 0.22]], 'triangle', 0.16);
      vibrate([30, 40, 30]);
    },
  };
}
