import { State } from 'ts-fsrs';
import type { ReviewEntry } from './model';
import type { CardState } from './scheduler';

export interface QueueCandidate {
  cardId: string;
  themeId: string;
  themeOrder: number;
  noteCreatedAt: number;
  state: CardState;
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
  const reviews: string[] = [];
  for (let i = 0; lanes.some((lane) => i < lane.length); i++) {
    for (const lane of lanes) if (i < lane.length) reviews.push(lane[i].cardId);
  }

  const fresh = candidates
    .filter(isNew)
    .sort((a, b) => a.themeOrder - b.themeOrder || a.noteCreatedAt - b.noteCreatedAt || a.cardId.localeCompare(b.cardId))
    .slice(0, Math.max(0, newLimit))
    .map((c) => c.cardId);

  return [...reviews, ...fresh];
}

export function nextDue(candidates: QueueCandidate[], now: number): number | null {
  const future = candidates.filter((c) => !isNew(c) && dueAt(c) > now).map(dueAt);
  return future.length ? Math.min(...future) : null;
}

export type CustomMode = 'due' | 'new' | 'practice';
export interface CustomChoice {
  themeIds: string[];
  mode: CustomMode;
  /** Cards at most; Infinity for all. */
  limit: number;
}

/**
 * A session the learner picks: due cards of some themes, new cards beyond the daily limit,
 * or free practice on cards already seen, the most forgotten first.
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
  if (choice.mode === 'due') return buildDailyQueue(chosen, now, 0).slice(0, choice.limit);
  let picked: QueueCandidate[];
  if (choice.mode === 'new') {
    picked = chosen.filter(isNew).sort((a, b) => a.themeOrder - b.themeOrder || a.noteCreatedAt - b.noteCreatedAt || a.cardId.localeCompare(b.cardId));
  } else {
    const r = new Map(chosen.map((c) => [c.cardId, retrievability(c)]));
    picked = chosen.filter((c) => !isNew(c)).sort((a, b) => r.get(a.cardId)! - r.get(b.cardId)! || dueAt(a) - dueAt(b) || a.cardId.localeCompare(b.cardId));
  }
  return picked.slice(0, choice.limit).map((c) => c.cardId);
}
