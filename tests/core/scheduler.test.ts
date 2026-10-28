import { describe, expect, test } from 'vitest';
import { State } from 'ts-fsrs';
import { makeScheduler, type CardState } from '../../src/core/scheduler';
import { DEFAULT_SETTINGS, type Rating, type ReviewEntry } from '../../src/core/model';
import { newId } from '../../src/core/ids';

const T0 = Date.UTC(2026, 9, 1, 8, 0, 0);
const MIN = 60_000;
const DAY = 86_400_000;

function entry(ts: number, rating: Rating, id = newId(ts)): ReviewEntry {
  return { id, cardId: 'c1', ts, rating, mode: 'production', correct: rating > 1, durationMs: 2000, hintUsed: false, deviceId: 'd' };
}

/** Answers each card when it falls due, with ratings drawn from a fixed seed. */
function simulate(count: number): { entries: ReviewEntry[]; states: CardState[] } {
  const s = makeScheduler(DEFAULT_SETTINGS);
  let seed = 42;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let state = s.initial(T0);
  let ts = T0;
  const entries: ReviewEntry[] = [];
  const states: CardState[] = [];
  for (let i = 0; i < count; i++) {
    const rating = (1 + Math.floor(rnd() * 4)) as Rating;
    const e = entry(ts, rating);
    state = s.apply(state, rating, ts);
    entries.push(e);
    states.push(state);
    ts = state.due.getTime() + 5 * MIN;
  }
  return { entries, states };
}

describe('scheduler', () => {
  const s = makeScheduler(DEFAULT_SETTINGS);

  test('a fresh card is New', () => {
    expect(s.initial(T0).state).toBe(State.New);
  });

  test('Good, then Good the next day, graduates the card to Review', () => {
    const learning = s.apply(s.initial(T0), 3, T0);
    expect(learning.state).toBe(State.Learning);
    const graduated = s.apply(learning, 3, T0 + DAY);
    expect(graduated.state).toBe(State.Review);
  });

  test('replaying the log equals applying the answers one by one', () => {
    const { entries, states } = simulate(12);
    expect(s.replay(T0, entries)).toEqual(states[states.length - 1]);
  });

  test('replay does not depend on insertion order', () => {
    const { entries, states } = simulate(12);
    const shuffled = [...entries].reverse();
    shuffled.push(shuffled.splice(3, 1)[0]);
    expect(s.replay(T0, shuffled)).toEqual(states[states.length - 1]);
  });

  test('entries with the same timestamp are ordered by id', () => {
    const a = entry(T0, 1, 'A');
    const b = entry(T0, 4, 'B');
    expect(s.replay(T0, [b, a])).toEqual(s.replay(T0, [a, b]));
    expect(s.replay(T0, [b, a])).toEqual(s.apply(s.apply(s.initial(T0), 1, T0), 4, T0));
  });

  test('retrievability is 0 for a new card and close to 1 right after a review', () => {
    expect(s.retrievability(s.initial(T0), T0)).toBe(0);
    const reviewed = s.replay(T0, [entry(T0, 3), entry(T0 + DAY, 3)]);
    expect(s.retrievability(reviewed, T0 + DAY)).toBeGreaterThan(0.99);
  });

  test('a lower desired retention schedules longer intervals', () => {
    const low = makeScheduler({ ...DEFAULT_SETTINGS, desiredRetention: 0.8 });
    const log = [entry(T0, 3), entry(T0 + DAY, 3), entry(T0 + 5 * DAY, 3), entry(T0 + 20 * DAY, 3)];
    expect(low.replay(T0, log).scheduled_days).toBeGreaterThan(s.replay(T0, log).scheduled_days);
  });
});
