import { State } from 'ts-fsrs';
import type { NoteType, ReviewEntry } from './model';
import type { CardState } from './scheduler';

export interface QueueCandidate {
  cardId: string;
  themeId: string;
  themeOrder: number;
  noteCreatedAt: number;
  state: CardState;
  /** The theme's domain shows its new cards alternating between themes (else chapter by chapter). */
  mixNew?: boolean;
  noteType?: NoteType;
  /** The theme's domain, for grouping new cards; falls back to the rank encoded in `themeOrder`. */
  domainId?: string | null;
}

/** Domain of a candidate: its id, else the rank encoded in `themeOrder` (domain order × 10 000 + theme order). */
const domainRank = (c: QueueCandidate) => c.domainId ?? `#${Math.floor(c.themeOrder / 10_000)}`;

function groupBy<K>(list: QueueCandidate[], key: (c: QueueCandidate) => K): Map<K, QueueCandidate[]> {
  const out = new Map<K, QueueCandidate[]>();
  for (const c of list) {
    const lane = out.get(key(c));
    if (lane) lane.push(c);
    else out.set(key(c), [c]);
  }
  return out;
}

/** Takes one card from each lane in turn until all are empty. */
function roundRobin<T>(lanes: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; lanes.some((lane) => i < lane.length); i++) for (const lane of lanes) if (i < lane.length) out.push(lane[i]);
  return out;
}

/**
 * New cards in learning order: domains in their order; inside a mixed domain, one card of each theme in turn;
 * otherwise theme after theme. Inside a theme, oldest note first.
 */
export function orderNew(candidates: QueueCandidate[]): QueueCandidate[] {
  const sorted = [...candidates].sort((a, b) => a.themeOrder - b.themeOrder || a.noteCreatedAt - b.noteCreatedAt || a.cardId.localeCompare(b.cardId));
  return [...groupBy(sorted, domainRank).values()].flatMap((list) => (list.some((c) => c.mixNew) ? roundRobin([...groupBy(list, (c) => c.themeId).values()]) : list));
}

export function studyDayStart(now: number, rolloverHour = 4): number {
  const d = new Date(now);
  if (d.getHours() < rolloverHour) d.setDate(d.getDate() - 1);
  d.setHours(rolloverHour, 0, 0, 0);
  return d.getTime();
}

export function countNewIntroduced(entries: ReviewEntry[], dayStart: number): number {
  const firstSeen = new Map<string, number>();
  for (const e of entries) firstSeen.set(e.cardId, Math.min(e.ts, firstSeen.get(e.cardId) ?? Infinity));
  return [...firstSeen.values()].filter((ts) => ts >= dayStart).length;
}

const isNew = (c: QueueCandidate) => c.state.state === State.New;
const dueAt = (c: QueueCandidate) => c.state.due.getTime();

/** Reviews first (most overdue first, alternating between themes), then today's new cards. */
export function buildDailyQueue(candidates: QueueCandidate[], now: number, newLimit: number): string[] {
  const byTheme = new Map<string, QueueCandidate[]>();
  for (const c of candidates.filter((c) => !isNew(c) && dueAt(c) <= now).sort((a, b) => dueAt(a) - dueAt(b))) {
    byTheme.set(c.themeId, [...(byTheme.get(c.themeId) ?? []), c]);
  }
  const lanes = [...byTheme.values()].sort((a, b) => a[0].themeOrder - b[0].themeOrder);
  const reviews = roundRobin(lanes).map((c) => c.cardId);

  const fresh = orderNew(candidates.filter(isNew))
    .slice(0, Math.max(0, newLimit))
    .map((c) => c.cardId);

  return [...reviews, ...fresh];
}

export function nextDue(candidates: QueueCandidate[], now: number): number | null {
  const future = candidates.filter((c) => !isNew(c) && dueAt(c) > now).map(dueAt);
  return future.length ? Math.min(...future) : null;
}

export type CustomMode = 'due' | 'new' | 'practice' | 'mix' | 'situations';
/** Note types that train choosing the right tool for a situation. */
export const SITUATION_TYPES: NoteType[] = ['scenario', 'classify'];
export interface CustomChoice {
  themeIds: string[];
  mode: CustomMode;
  /** Cards at most; Infinity for all. */
  limit: number;
}

/**
 * A session the learner picks: due cards of some themes, new cards beyond the daily limit,
 * or free practice on seen cards that are not due yet (due ones belong to the due mode), the most forgotten first.
 */
export function buildCustomQueue(
  candidates: QueueCandidate[],
  now: number,
  choice: CustomChoice,
  retrievability: (c: QueueCandidate) => number,
): string[] {
  const themes = new Set(choice.themeIds);
  const chosen = candidates.filter((c) => themes.has(c.themeId));
  // Due cards: same order as the daily queue, without new cards.
  const dueOf = (list: QueueCandidate[]) => buildDailyQueue(list, now, 0);
  const newOf = (list: QueueCandidate[]) => orderNew(list.filter(isNew)).map((c) => c.cardId);
  const fragileOf = (list: QueueCandidate[]) => {
    const r = new Map(list.map((c) => [c.cardId, retrievability(c)]));
    return list
      .filter((c) => !isNew(c) && dueAt(c) > now)
      .sort((a, b) => r.get(a.cardId)! - r.get(b.cardId)! || dueAt(a) - dueAt(b) || a.cardId.localeCompare(b.cardId))
      .map((c) => c.cardId);
  };
  let picked: string[];
  if (choice.mode === 'due') picked = dueOf(chosen);
  else if (choice.mode === 'new') picked = newOf(chosen);
  else if (choice.mode === 'practice') picked = fragileOf(chosen);
  // Everything in turn: what is due, something new, something fragile.
  else if (choice.mode === 'mix') picked = roundRobin([dueOf(chosen), newOf(chosen), fragileOf(chosen)]);
  else {
    const situations = chosen.filter((c) => c.noteType && SITUATION_TYPES.includes(c.noteType));
    picked = [...dueOf(situations), ...fragileOf(situations), ...newOf(situations)];
  }
  return picked.slice(0, choice.limit);
}
