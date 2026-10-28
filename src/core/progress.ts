import { State } from 'ts-fsrs';
import type { ReviewEntry } from './model';
import { studyDayStart } from './queue';
import { byTimeThenId, type Scheduler } from './scheduler';

export type EntryKind = 'new' | 'due' | 'early';

/** Rewards treating due cards, not succeeding: avoiding hard cards earns nothing, reviewing early earns nothing. */
export const XP = { due: 10, new: 5, early: 0, round: 20 } as const;

const FREEZE_EVERY = 7;
const MAX_FREEZES = 2;
const HOUR = 3_600_000;

/** Kind of each answer, from the card's replayed state just before it. Keyed by entry id. */
export function classifyEntries(cards: { cardId: string; createdAt: number }[], entries: ReviewEntry[], scheduler: Scheduler): Map<string, EntryKind> {
  const createdAt = new Map(cards.map((c) => [c.cardId, c.createdAt]));
  const byCard = new Map<string, ReviewEntry[]>();
  for (const e of entries) {
    const list = byCard.get(e.cardId);
    if (list) list.push(e);
    else byCard.set(e.cardId, [e]);
  }
  const kinds = new Map<string, EntryKind>();
  for (const [cardId, log] of byCard) {
    log.sort(byTimeThenId);
    let state = scheduler.initial(createdAt.get(cardId) ?? log[0].ts);
    for (const e of log) {
      kinds.set(e.id, state.state === State.New ? 'new' : state.due.getTime() <= e.ts ? 'due' : 'early');
      state = scheduler.apply(state, e.rating, e.ts);
    }
  }
  return kinds;
}

export function xpBetween(entries: ReviewEntry[], kinds: Map<string, EntryKind>, roundEnds: number[], from: number, to: number): number {
  const inRange = (ts: number) => ts >= from && ts < to;
  const answers = entries.filter((e) => inRange(e.ts)).reduce((sum, e) => sum + XP[kinds.get(e.id) ?? 'early'], 0);
  return answers + roundEnds.filter(inRange).length * XP.round;
}

/** Start of the next study day; going through noon keeps it right across DST changes. */
export function nextStudyDay(dayStart: number): number {
  return studyDayStart(dayStart + 36 * HOUR);
}

export function goalDays(roundEnds: number[]): number[] {
  return [...new Set(roundEnds.map((ts) => studyDayStart(ts)))].sort((a, b) => a - b);
}

/**
 * Walks every study day from the first goal day. A missed day uses a freeze if one is left,
 * otherwise resets the streak. Today only counts once its goal is reached.
 */
export function streakState(days: number[], todayStart: number): { current: number; freezes: number; todayDone: boolean } {
  const goals = new Set(days);
  const todayDone = goals.has(todayStart);
  if (days.length === 0) return { current: 0, freezes: 0, todayDone };
  let current = 0;
  let freezes = 0;
  for (let d = days[0]; d < todayStart || (d === todayStart && todayDone); d = nextStudyDay(d)) {
    if (goals.has(d)) {
      current++;
      if (current % FREEZE_EVERY === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);
    } else if (freezes > 0) {
      freezes--;
    } else {
      current = 0;
    }
  }
  return { current, freezes, todayDone };
}

export function weekStart(now: number): number {
  const d = new Date(studyDayStart(now));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return studyDayStart(d.getTime() + 12 * HOUR);
}
