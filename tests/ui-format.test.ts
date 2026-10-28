import { describe, expect, test } from 'vitest';
import { inHowLong } from '../src/ui/format';

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
