import { describe, expect, test } from 'vitest';
import { State } from 'ts-fsrs';
import { easyThreshold, selectMode, toRating, type Outcome } from '../../src/core/grading';

const fresh = { state: State.New, stability: 0 };
const young = { state: State.Review, stability: 6.9 };
const solid = { state: State.Review, stability: 7 };
const ok = (durationMs = 3000, hintUsed = false): Outcome => ({ kind: 'auto', correct: true, durationMs, hintUsed });
const wrong: Outcome = { kind: 'auto', correct: false, durationMs: 3000, hintUsed: false };

describe('selectMode', () => {
  test('new and young cards are shown as recognition', () => {
    expect(selectMode('cloze', fresh)).toBe('recognition');
    expect(selectMode('cloze', young)).toBe('recognition');
    expect(selectMode('cloze', { state: State.Relearning, stability: 30 })).toBe('recognition');
  });

  test('cards with stability of 7 days or more switch to production', () => {
    expect(selectMode('cloze', solid)).toBe('production');
    expect(selectMode('ordering', solid)).toBe('production');
    expect(selectMode('classify', young)).toBe('recognition');
  });

  test('mcq always stays recognition', () => {
    expect(selectMode('mcq', { state: State.Review, stability: 30 })).toBe('recognition');
  });

  test('scenario always uses self-assessment', () => {
    expect(selectMode('scenario', fresh)).toBe('self');
  });

  test('basic uses recognition only when enough distractors exist', () => {
    expect(selectMode('basic', fresh, { basicDistractors: 3 })).toBe('recognition');
    expect(selectMode('basic', fresh, { basicDistractors: 2 })).toBe('self');
    expect(selectMode('basic', { state: State.Review, stability: 10 }, { basicDistractors: 3 })).toBe('self');
  });
});

describe('toRating', () => {
  test('a wrong answer is Again in any automatic mode', () => {
    expect(toRating('recognition', wrong, null)).toBe(1);
    expect(toRating('production', wrong, 5000)).toBe(1);
  });

  test('a correct recognition answer is Hard', () => {
    expect(toRating('recognition', ok(), 5000)).toBe(2);
  });

  test('a fast correct production answer without hint is Easy', () => {
    expect(toRating('production', ok(3000), 5000)).toBe(4);
  });

  test('a hint prevents Easy', () => {
    expect(toRating('production', ok(3000, true), 5000)).toBe(3);
  });

  test('no Easy without a personal threshold', () => {
    expect(toRating('production', ok(3000), null)).toBe(3);
  });

  test('an implausible duration never gives Easy', () => {
    expect(toRating('production', ok(0), 5000)).toBe(3);
    expect(toRating('production', ok(-50), 5000)).toBe(3);
  });

  test('self-assessment maps Raté/Difficile/Su to 1/2/3', () => {
    expect(toRating('self', { kind: 'self', grade: 1 }, null)).toBe(1);
    expect(toRating('self', { kind: 'self', grade: 2 }, null)).toBe(2);
    expect(toRating('self', { kind: 'self', grade: 3 }, null)).toBe(3);
  });
});

describe('easyThreshold', () => {
  test('needs at least 5 samples', () => {
    expect(easyThreshold([1000, 2000, 3000, 4000])).toBeNull();
  });

  test('is the median of valid samples', () => {
    expect(easyThreshold([1000, 2000, 3000, 4000, 5000])).toBe(3000);
    expect(easyThreshold([1000, 2000, 3000, 4000, 5000, 6000])).toBe(3500);
  });

  test('ignores durations outside 300 ms .. 10 min', () => {
    expect(easyThreshold([0, 100, 7_200_000, 1000, 2000, 3000, 4000])).toBeNull();
  });
});
