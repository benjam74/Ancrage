import { describe, expect, test } from 'vitest';
import { howLongAgo, inHowLong } from '../src/ui/format';

describe('inHowLong', () => {
  const now = 0;
  test('formats minutes, hours, days, months and years in French', () => {
    expect(inHowLong(now + 10 * 60_000, now)).toBe('dans 10 min');
    expect(inHowLong(now + 20_000, now)).toBe('dans 1 min');
    expect(inHowLong(now + 3 * 3_600_000, now)).toBe('dans 3 h');
    expect(inHowLong(now + 4 * 86_400_000, now)).toBe('dans 4 j');
    expect(inHowLong(now + 90 * 86_400_000, now)).toBe('dans 3 mois');
    expect(inHowLong(now + 800 * 86_400_000, now)).toBe('dans 2 ans');
  });
});

describe('howLongAgo', () => {
  test('formats elapsed time in French', () => {
    expect(howLongAgo(1_000_000, 1_000_000 + 20_000)).toBe('à l’instant');
    expect(howLongAgo(0, 5 * 60_000)).toBe('il y a 5 min');
    expect(howLongAgo(0, 3 * 3_600_000)).toBe('il y a 3 h');
    expect(howLongAgo(0, 2 * 86_400_000)).toBe('il y a 2 j');
  });
});
