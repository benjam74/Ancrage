import type { Lang } from '../core/model';

/** Reading aloud and dictation through the browser's own speech services; everything degrades to nothing. */

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(text: string, lang: Lang): void {
  if (!canSpeak() || !text.trim()) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    // A voice of the right language, the local one first: some browsers otherwise read English with a French voice.
    const voices = synth.getVoices().filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
    const voice = voices.find((v) => v.lang.replace('_', '-') === lang && v.localService) ?? voices.find((v) => v.lang.replace('_', '-') === lang) ?? voices[0];
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
};

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canDictate = () => recognitionClass() !== null;

/** One spoken phrase as text; rejects with a French message when the browser refuses or hears nothing. */
export function dictate(lang: Lang): { done: Promise<string>; stop: () => void } {
  const Rec = recognitionClass();
  if (!Rec) return { done: Promise.reject(new Error('La dictée n’est pas disponible dans ce navigateur.')), stop: () => {} };
  const rec = new Rec();
  rec.lang = lang;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  const done = new Promise<string>((resolve, reject) => {
    let heard = '';
    rec.onresult = (e) => (heard = Array.from(e.results).map((r) => r[0]?.transcript ?? '').join(' ').trim());
    rec.onerror = (e) =>
      reject(new Error(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Autorise le micro pour dicter ta réponse.' : 'Je n’ai rien entendu. Réessaie.'));
    rec.onend = () => (heard ? resolve(heard) : reject(new Error('Je n’ai rien entendu. Réessaie.')));
  });
  try {
    rec.start();
  } catch {
    return { done: Promise.reject(new Error('La dictée n’a pas pu démarrer.')), stop: () => {} };
  }
  return { done, stop: () => rec.stop() };
}
