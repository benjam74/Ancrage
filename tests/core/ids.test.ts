import { describe, expect, test } from 'vitest';
import { newId } from '../../src/core/ids';

describe('newId', () => {
  test('is 26 characters long', () => {
    expect(newId(1000)).toHaveLength(26);
  });

  test('sorts lexicographically in time order', () => {
    expect(newId(1000) < newId(2000)).toBe(true);
  });

  test('floors fractional timestamps', () => {
    expect(newId(1500.7).slice(0, 10)).toBe(newId(1500).slice(0, 10));
  });

  test('rejects negative or non-finite timestamps', () => {
    expect(() => newId(-1)).toThrow();
    expect(() => newId(Number.NaN)).toThrow();
  });

  test('stays unique and sorted within the same millisecond', () => {
    const ids = Array.from({ length: 1000 }, () => newId(5));
    expect(new Set(ids).size).toBe(1000);
    expect([...ids].sort()).toEqual(ids);
  });
});
