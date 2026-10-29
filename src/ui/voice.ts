import type { Lang } from '../core/model';

/** Reading aloud and dictation through the browser's own speech services; everything degrades to nothing. */

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

// Chrome lists its voices only after `voiceschanged`: keep the latest list.
let voices: SpeechSynthesisVoice[] = [];
if (canSpeak()) {
  try {
    voices = window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', () => (voices = window.speechSynthesis.getVoices()));
  } catch {
    // ignore
  }
}

/** iOS only speaks after a user gesture: call this from a tap so later automatic reading is allowed. */
export function primeSpeech(): void {
  try {
    if (canSpeak() && !primed) {
      primed = true;
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    }
  } catch {
    // ignore
  }
}
let primed = false;

export function speak(text: string, lang: Lang): void {
  if (!canSpeak() || !text.trim()) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    // A voice of the right language, the local one first: some browsers otherwise read English with a French voice.
    if (!voices.length) voices = synth.getVoices();
    const matching = voices.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
    const voice = matching.find((v) => v.lang.replace('_', '-') === lang && v.localService) ?? matching.find((v) => v.lang.replace('_', '-') === lang) ?? matching[0];
    if (voice) u.voice = voice;
    u.rate = 0.95;
    synth.speak(u);
  } catch {
    // Speech is a bonus: never break a session for it.
  }
}

export function stopSpeaking(): void {
  try {
    if (canSpeak()) window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

/** Some browsers never end a recognition: give up after this long. */
const DICTATION_TIMEOUT = 12_000;

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canDictate = () => recognitionClass() !== null;

/** One spoken phrase as text. Rejects with a French message, or an empty one when the learner stopped before speaking. */
export function dictate(lang: Lang): { done: Promise<string>; stop: () => void; abort: () => void } {
  const Rec = recognitionClass();
  if (!Rec) return { done: Promise.reject(new Error('La dictée n’est pas disponible dans ce navigateur.')), stop: () => {}, abort: () => {} };
  const rec = new Rec();
  rec.lang = lang;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const done = new Promise<string>((resolve, reject) => {
    let heard = '';
    let failed: string | null = null;
    rec.onresult = (e) => (heard = Array.from(e.results).map((r) => r[0]?.transcript ?? '').join(' ').trim());
    rec.onerror = (e) => {
      failed =
        e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Autorise le micro pour dicter ta réponse.'
        : e.error === 'network' ? 'La dictée demande une connexion à Internet.'
        : e.error === 'aborted' ? ''
        : 'Je n’ai rien entendu. Réessaie.';
    };
    rec.onend = () => {
      clearTimeout(watchdog);
      if (heard) resolve(heard);
      else reject(new Error(failed ?? ''));
    };
    watchdog = setTimeout(() => {
      try {
        rec.abort();
      } catch {
        // ignore
      }
      if (heard) resolve(heard);
      else reject(new Error('Je n’ai rien entendu. Réessaie.'));
    }, DICTATION_TIMEOUT);
  });
  try {
    rec.start();
  } catch {
    clearTimeout(watchdog);
    return { done: Promise.reject(new Error('La dictée n’a pas pu démarrer.')), stop: () => {}, abort: () => {} };
  }
  const safe = (f: () => void) => () => {
    try {
      f();
    } catch {
      // ignore
    }
  };
  return { done, stop: safe(() => rec.stop()), abort: safe(() => { clearTimeout(watchdog); rec.abort(); }) };
}
