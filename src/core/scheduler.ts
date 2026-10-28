import { createEmptyCard, fsrs, type Card as FsrsCard, type Grade } from 'ts-fsrs';
import type { Rating, ReviewEntry, Settings } from './model';

export type CardState = FsrsCard;

export interface Scheduler {
  initial(createdAt: number): CardState;
  apply(state: CardState, rating: Rating, ts: number): CardState;
  /** Rebuilds a card's state from its log. The log is the only source of truth. */
  replay(createdAt: number, entries: ReviewEntry[]): CardState;
  retrievability(state: CardState, now: number): number;
}

export function byTimeThenId(a: ReviewEntry, b: ReviewEntry): number {
  return a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function makeScheduler(settings: Settings): Scheduler {
  // Fuzz is seeded from the review itself (time, reps, memory state), so replays are deterministic.
  const f = fsrs({ request_retention: settings.desiredRetention, enable_fuzz: true });

  const initial = (createdAt: number) => createEmptyCard(new Date(createdAt));
  const apply = (state: CardState, rating: Rating, ts: number) => f.next(state, new Date(ts), rating as Grade).card;

  return {
    initial,
    apply,
    replay: (createdAt, entries) =>
      [...entries].sort(byTimeThenId).reduce((state, e) => apply(state, e.rating, e.ts), initial(createdAt)),
    retrievability: (state, now) => f.get_retrievability(state, new Date(now), false),
  };
}
