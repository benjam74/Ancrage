import type { KeyValue } from './cloud';

/** Per-device preferences: kept out of backups and sync (sound and haptics depend on the device). */
export interface Prefs {
  sound: boolean;
  haptics: boolean;
  motion: boolean;
  showStreak: boolean;
  dailyRounds: 1 | 2 | 3;
  plan: { time: string; cue: string } | null;
  /** Item the learner is saving for. */
  goal: string | null;
  /** Chapter the character stood on at the last visit, to animate its walk to the next one. */
  lastChapter: string | null;
}

export const DEFAULT_PREFS: Prefs = { sound: true, haptics: true, motion: true, showStreak: true, dailyRounds: 1, plan: null, goal: null, lastChapter: null };

const KEY = 'ancrage.prefs';
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function parsePlan(v: unknown): Prefs['plan'] {
  if (!v || typeof v !== 'object') return null;
  const { time, cue } = v as Record<string, unknown>;
  return typeof time === 'string' && TIME.test(time) ? { time, cue: typeof cue === 'string' ? cue.slice(0, 80) : '' } : null;
}

export function loadPrefs(store: KeyValue): Prefs {
  let raw: unknown;
  try {
    raw = JSON.parse(store.get(KEY) ?? 'null');
  } catch {
    return { ...DEFAULT_PREFS };
  }
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PREFS };
  const r = raw as Record<string, unknown>;
  const bool = (k: 'sound' | 'haptics' | 'motion' | 'showStreak') => (typeof r[k] === 'boolean' ? (r[k] as boolean) : DEFAULT_PREFS[k]);
  return {
    sound: bool('sound'),
    haptics: bool('haptics'),
    motion: bool('motion'),
    showStreak: bool('showStreak'),
    dailyRounds: r.dailyRounds === 2 || r.dailyRounds === 3 ? r.dailyRounds : 1,
    plan: parsePlan(r.plan),
    goal: typeof r.goal === 'string' ? r.goal : null,
    lastChapter: typeof r.lastChapter === 'string' ? r.lastChapter : null,
  };
}

export function savePrefs(store: KeyValue, p: Prefs): void {
  store.set(KEY, JSON.stringify(p));
}
