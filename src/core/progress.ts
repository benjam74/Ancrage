import { State } from 'ts-fsrs';
import type { ReviewEntry } from './model';
import { studyDayStart } from './queue';
import { byTimeThenId, type Scheduler } from './scheduler';

export type EntryKind = 'new' | 'due' | 'early';

/** Rewards treating due cards, not succeeding: avoiding hard cards earns nothing, reviewing early earns nothing. */
export const XP = { due: 10, new: 5, early: 0, round: 20, comeback: 20 } as const;

export type DayStatus = 'done' | 'freeze' | 'rest' | 'missed' | 'repaired';
export type StripDay = { dayStart: number; status: DayStatus | 'today' | 'future' | 'none' };

/** Rounds needed the day after a missed day to repair the streak. */
export const REPAIR_ROUNDS = 2;
/** Study days since the previous goal day that make a round a comeback. */
const COMEBACK_GAP = 3;

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

export function xpBetween(
  entries: ReviewEntry[],
  kinds: Map<string, EntryKind>,
  roundEnds: number[],
  from: number,
  to: number,
  bonusEnds: number[] = [],
): number {
  const inRange = (ts: number) => ts >= from && ts < to;
  const answers = entries.filter((e) => inRange(e.ts)).reduce((sum, e) => sum + XP[kinds.get(e.id) ?? 'early'], 0);
  return answers + roundEnds.filter(inRange).length * XP.round + bonusEnds.filter(inRange).length * XP.comeback;
}

/** Start of the next study day; going through noon keeps it right across DST changes. */
export function nextStudyDay(dayStart: number): number {
  return studyDayStart(dayStart + 36 * HOUR);
}

export function goalDays(roundEnds: number[]): number[] {
  return [...new Set(roundEnds.map((ts) => studyDayStart(ts)))].sort((a, b) => a - b);
}

export function roundsPerDay(roundEnds: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const ts of roundEnds) {
    const d = studyDayStart(ts);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return counts;
}

/**
 * Walks every study day from the first goal day. A missed day uses a freeze if one is left; otherwise
 * it is repaired when the next study day has REPAIR_ROUNDS rounds, or it resets the streak. A rest day
 * (nothing to review) is skipped. Today only counts once its goal is reached.
 * `repair` is offered while today can still repair yesterday.
 */
export function streakState(
  days: number[],
  todayStart: number,
  isRestDay: (dayStart: number) => boolean = () => false,
  roundsOn: (dayStart: number) => number = () => 1,
): { current: number; freezes: number; todayDone: boolean; best: number; history: Map<number, DayStatus>; repair: { lost: number; rounds: number } | null } {
  const goals = new Set(days);
  const todayDone = goals.has(todayStart);
  const history = new Map<number, DayStatus>();
  let current = 0;
  let freezes = 0;
  let best = 0;
  let repair: { lost: number; rounds: number } | null = null;
  if (days.length === 0) return { current, freezes, todayDone, best, history, repair };
  for (let d = days[0]; d < todayStart || (d === todayStart && todayDone); d = nextStudyDay(d)) {
    if (goals.has(d)) {
      current++;
      history.set(d, 'done');
      if (current % FREEZE_EVERY === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);
    } else if (isRestDay(d)) {
      // Nothing could be reviewed that day: it neither grows nor breaks the streak.
      history.set(d, 'rest');
    } else if (freezes > 0) {
      freezes--;
      history.set(d, 'freeze');
    } else {
      const next = nextStudyDay(d);
      const nextRounds = goals.has(next) ? roundsOn(next) : 0;
      if (current > 0 && next <= todayStart && nextRounds >= REPAIR_ROUNDS) {
        history.set(d, 'repaired');
      } else {
        if (current > 0 && next === todayStart) repair = { lost: current, rounds: nextRounds };
        history.set(d, 'missed');
        current = 0;
      }
    }
    best = Math.max(best, current);
  }
  return { current, freezes, todayDone, best, history, repair };
}

/** Round ends that earn the comeback bonus: the first round of a day long after the previous goal day. */
export function comebackRounds(roundEnds: number[]): number[] {
  const sorted = [...roundEnds].sort((a, b) => a - b);
  const out: number[] = [];
  let lastDay: number | null = null;
  for (const ts of sorted) {
    const d = studyDayStart(ts);
    if (d === lastDay) continue;
    if (lastDay !== null) {
      let gap = 0;
      for (let x = lastDay; x < d && gap < COMEBACK_GAP; x = nextStudyDay(x)) gap++;
      if (gap >= COMEBACK_GAP) out.push(ts);
    }
    lastDay = d;
  }
  return out;
}

/** Monday to Sunday of the current week, for the streak strip. */
export function weekStrip(history: Map<number, DayStatus>, todayStart: number, todayDone: boolean): StripDay[] {
  const out: StripDay[] = [];
  for (let d = weekStart(todayStart); out.length < 7; d = nextStudyDay(d)) {
    const status = d === todayStart ? (todayDone ? 'done' : 'today') : d > todayStart ? 'future' : (history.get(d) ?? 'none');
    out.push({ dayStart: d, status });
  }
  return out;
}

export function weekStart(now: number): number {
  const d = new Date(studyDayStart(now));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return studyDayStart(d.getTime() + 12 * HOUR);
}

/**
 * A study day is a rest day when, at its start, no card was due before its end and no unseen card
 * could be introduced. Derived from the log, so it needs no stored event.
 */
export function makeRestDayCheck(
  cards: { cardId: string; createdAt: number }[],
  entries: ReviewEntry[],
  scheduler: Scheduler,
  newPerDay: number,
): (dayStart: number) => boolean {
  const byCard = new Map<string, ReviewEntry[]>();
  for (const e of entries) {
    const list = byCard.get(e.cardId);
    if (list) list.push(e);
    else byCard.set(e.cardId, [e]);
  }
  const timelines = cards.map(({ cardId, createdAt }) => {
    const log = (byCard.get(cardId) ?? []).sort(byTimeThenId);
    let state = scheduler.initial(createdAt);
    const steps = log.map((e) => {
      state = scheduler.apply(state, e.rating, e.ts);
      return { ts: e.ts, due: state.due.getTime() };
    });
    return { createdAt, steps };
  });
  return (dayStart) => {
    const end = nextStudyDay(dayStart);
    for (const { createdAt, steps } of timelines) {
      if (createdAt >= end) continue;
      let due: number | null = null;
      for (const step of steps) {
        if (step.ts >= dayStart) break;
        due = step.due;
      }
      if (due === null ? newPerDay > 0 : due < end) return false;
    }
    return true;
  };
}
