import { describe, expect, test } from 'vitest';
import { ROUND_SIZE, advance, currentCard, isRetry, startRound } from '../../src/core/round';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);

describe('round', () => {
  test('takes at most ROUND_SIZE cards', () => {
    const r = startRound(ids(14));
    expect(ROUND_SIZE).toBe(10);
    expect(r.pending).toEqual(ids(10));
    expect(r.total).toBe(10);
  });

  test('ten correct answers finish the round', () => {
    let r = startRound(ids(10));
    for (let i = 0; i < 10; i++) r = advance(r, true);
    expect(r).toMatchObject({ pending: [], done: 10, correct: 10, answered: 10 });
    expect(currentCard(r)).toBeUndefined();
  });

  test('a missed card comes back once at the end', () => {
    let r = advance(startRound(ids(3)), false);
    expect(r.pending).toEqual(['c1', 'c2', 'c0']);
    expect(r.total).toBe(4);
    r = advance(advance(r, true), true);
    expect(currentCard(r)).toBe('c0');
    expect(isRetry(r, 'c0')).toBe(true);
    expect(isRetry(r, 'c1')).toBe(false);
  });

  test('a card missed again on its retry does not come back a third time', () => {
    let r = advance(startRound(['a']), false);
    r = advance(r, false);
    expect(r.pending).toEqual([]);
    expect(r).toMatchObject({ done: 2, total: 2, correct: 0, answered: 2 });
  });

  test('advance does not mutate its input', () => {
    const r = startRound(ids(2));
    const copy = structuredClone(r);
    advance(r, false);
    expect(r).toEqual(copy);
  });
});
