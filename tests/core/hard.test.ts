import { describe, expect, test } from 'vitest';
import { HARD_CLEAR, HARD_LAPSES, isHard } from '../../src/core/hard';
import type { Rating, ReviewEntry } from '../../src/core/model';

const log = (ratings: Rating[]): ReviewEntry[] =>
  ratings.map((rating, i) => ({ id: `r${i}`, cardId: 'c', ts: 1000 + i, rating, mode: 'production', correct: rating > 1, durationMs: 1000, hintUsed: false, deviceId: 'd' }));

describe('isHard', () => {
  test('from 4 lapses on', () => {
    expect(HARD_LAPSES).toBe(4);
    expect(isHard(3, log([3, 1, 3, 1, 3, 1]))).toBe(false);
    expect(isHard(4, log([3, 1, 3, 1, 3, 1, 3, 1]))).toBe(true);
  });
  test('until it is answered right 3 times in a row since the last miss', () => {
    expect(HARD_CLEAR).toBe(3);
    expect(isHard(4, log([1, 1, 1, 1, 3, 3]))).toBe(true);
    expect(isHard(4, log([1, 1, 1, 1, 3, 3, 3]))).toBe(false);
    expect(isHard(5, log([1, 1, 1, 1, 3, 3, 3, 1]))).toBe(true);
  });
  test('order of the log is by time, whatever the array order', () => {
    expect(isHard(4, log([1, 1, 1, 1, 3, 3, 3]).reverse())).toBe(false);
  });
});
