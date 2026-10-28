import { describe, expect, test } from 'vitest';
import { State } from 'ts-fsrs';
import { dailyCounts, forecast, mastery, retention, stateBreakdown } from '../../src/core/stats';
import { makeScheduler, type CardState } from '../../src/core/scheduler';
import { studyDayStart } from '../../src/core/queue';
import { DEFAULT_SETTINGS, type ReviewEntry } from '../../src/core/model';

const s = makeScheduler(DEFAULT_SETTINGS);
const DAY = 86_400_000;
const NOW = new Date(2026, 9, 28, 10, 0).getTime();
const base = s.initial(0);
const card = (state: State, stability: number, lastReview: number, due = NOW + 10 * DAY): CardState => ({
  ...base, state, stability, last_review: new Date(lastReview), due: new Date(due), reps: state === State.New ? 0 : 3,
});
const solid = () => card(State.Review, 30, NOW - DAY);
const young = () => card(State.Review, 5, NOW - DAY);
const fresh = () => ({ ...base });

let seq = 0;
const entry = (ts: number, correct = true): ReviewEntry => ({
  id: `e${seq++}`, cardId: 'c', ts, rating: correct ? 3 : 1, mode: 'production', correct, durationMs: 1, hintUsed: false, deviceId: 'd',
});

describe('mastery', () => {
  test('no card or only new cards is Nouveau, without dividing by zero', () => {
    expect(mastery([], NOW, s)).toEqual({ cards: 0, mastered: 0, pct: 0, level: 'Nouveau' });
    expect(mastery([fresh(), fresh()], NOW, s).level).toBe('Nouveau');
  });

  test('a stable, recently reviewed card is mastered; the same card long overdue is not', () => {
    expect(mastery([solid()], NOW, s).mastered).toBe(1);
    expect(mastery([solid()], NOW + 200 * DAY, s).mastered).toBe(0);
  });

  test('level thresholds at 25, 60 and 90 percent', () => {
    const mix = (m: number, total: number) => [...Array.from({ length: m }, solid), ...Array.from({ length: total - m }, young)];
    expect(mastery(mix(24, 100), NOW, s).level).toBe('Découverte');
    expect(mastery(mix(25, 100), NOW, s).level).toBe('En cours');
    expect(mastery(mix(59, 100), NOW, s).level).toBe('En cours');
    expect(mastery(mix(60, 100), NOW, s).level).toBe('Solide');
    expect(mastery(mix(89, 100), NOW, s).level).toBe('Solide');
    expect(mastery(mix(90, 100), NOW, s).level).toBe('Ancré');
    expect(mastery(mix(90, 100), NOW, s).pct).toBe(90);
  });

  test('levels use the exact share: 179 of 200 (89.5 %) is not yet Ancré', () => {
    const mix = (m: number, total: number) => [...Array.from({ length: m }, solid), ...Array.from({ length: total - m }, young)];
    expect(mastery(mix(179, 200), NOW, s)).toMatchObject({ pct: 90, level: 'Solide' });
    expect(mastery(mix(49, 200), NOW, s).level).toBe('Découverte');
  });
});

describe('dailyCounts', () => {
  test('counts reviews per study day, oldest first, with 3 am in the previous day', () => {
    const today = studyDayStart(NOW);
    const counts = dailyCounts([entry(NOW), entry(NOW - DAY), entry(new Date(2026, 9, 28, 3, 0).getTime()), entry(NOW - 10 * DAY)], today, 3);
    expect(counts).toEqual([0, 2, 1]);
  });
});

describe('forecast', () => {
  test('overdue cards land today, new cards are ignored', () => {
    const states = [card(State.Review, 5, NOW - 9 * DAY, NOW - 2 * DAY), card(State.Review, 5, NOW, NOW + 2 * DAY), fresh()];
    expect(forecast(states, NOW, 4)).toEqual([1, 0, 1, 0]);
  });
});

describe('retention', () => {
  test('share of correct answers among due reviews since a date', () => {
    const e = [entry(NOW), entry(NOW + 1), entry(NOW + 2, false), entry(NOW + 3)];
    const kinds = new Map([[e[0].id, 'due'], [e[1].id, 'due'], [e[2].id, 'due'], [e[3].id, 'new']] as const);
    expect(retention(e, new Map(kinds), NOW)).toBeCloseTo(2 / 3);
    expect(retention([e[3]], new Map(kinds), NOW)).toBeNull();
  });
});

describe('stateBreakdown', () => {
  test('counts new, learning, young and anchored cards', () => {
    const states = [fresh(), card(State.Learning, 0.5, NOW), card(State.Relearning, 2, NOW), young(), solid(), solid()];
    expect(stateBreakdown(states)).toEqual({ nouvelles: 1, apprentissage: 2, jeunes: 1, ancrees: 2 });
  });
});
