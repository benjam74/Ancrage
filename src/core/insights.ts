import { State } from 'ts-fsrs';
import type { NoteType, ReviewEntry } from './model';
import type { EntryKind } from './progress';
import { studyDayStart } from './queue';
import type { CardState, Scheduler } from './scheduler';

const DAY = 86_400_000;
/** A pause longer than this is not thinking time. */
const MAX_DURATION = 5 * 60_000;

/** Mean probability of recall of the cards already studied, now and in 30 days without review. */
export function memoryOf(states: CardState[], now: number, scheduler: Scheduler): { now: number; in30: number } | null {
  const seen = states.filter((s) => s.state !== State.New);
  if (!seen.length) return null;
  const mean = (at: number) => seen.reduce((sum, s) => sum + scheduler.retrievability(s, at), 0) / seen.length;
  return { now: mean(now), in30: mean(now + 30 * DAY) };
}

/** Reviews a new card brings over `days` days if answered right (« Bien ») at each due date; learning steps of the first day are not counted. */
export function reviewLoad(scheduler: Scheduler, now: number, days = 30): number {
  let state = scheduler.initial(now);
  let at = now;
  let reviews = 0;
  for (let i = 0; at < now + days * DAY && i < 200; i++) {
    if (state.state === State.Review) reviews++;
    state = scheduler.apply(state, 3, at);
    at = Math.max(at + 1, state.due.getTime());
  }
  return reviews;
}

export interface Rate {
  key: string;
  rate: number;
  count: number;
}

export interface Effectiveness {
  windows: { days: number; rate: number | null; count: number; activeDays: number }[];
  /** Over 90 days, due reviews only. */
  byType: Rate[];
  byDomain: Rate[];
  /** Median time per answer over 90 days. */
  medianMs: number | null;
}

function rates(entries: ReviewEntry[], keyOf: (e: ReviewEntry) => string | undefined): Rate[] {
  const acc = new Map<string, { ok: number; count: number }>();
  for (const e of entries) {
    const key = keyOf(e);
    if (key === undefined) continue;
    const a = acc.get(key) ?? { ok: 0, count: 0 };
    a.count++;
    if (e.correct) a.ok++;
    acc.set(key, a);
  }
  return [...acc].map(([key, a]) => ({ key, rate: a.ok / a.count, count: a.count })).sort((a, b) => a.key.localeCompare(b.key, 'fr'));
}

/** Is it working? Success on due reviews (the ones that test memory), regularity and pace. */
export function effectiveness(
  entries: ReviewEntry[],
  kinds: Map<string, EntryKind>,
  typeOf: (cardId: string) => NoteType | undefined,
  domainOf: (cardId: string) => string | undefined,
  now: number,
): Effectiveness {
  const since = (days: number) => entries.filter((e) => e.ts >= now - days * DAY && e.ts <= now);
  const windows = [30, 90].map((days) => {
    const recent = since(days);
    const due = recent.filter((e) => kinds.get(e.id) === 'due');
    return {
      days,
      rate: due.length ? due.filter((e) => e.correct).length / due.length : null,
      count: due.length,
      activeDays: new Set(recent.map((e) => studyDayStart(e.ts))).size,
    };
  });
  const last90 = since(90);
  const due90 = last90.filter((e) => kinds.get(e.id) === 'due');
  // Self-graded answers are recorded without a duration.
  const durations = last90.filter((e) => e.durationMs > 0).map((e) => Math.min(e.durationMs, MAX_DURATION)).sort((a, b) => a - b);
  const mid = durations.length >> 1;
  return {
    windows,
    byType: rates(due90, (e) => typeOf(e.cardId)),
    byDomain: rates(due90, (e) => domainOf(e.cardId)),
    medianMs: durations.length ? (durations.length % 2 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2) : null,
  };
}
