import { describe, expect, test } from 'vitest';
import { newId } from '../../src/core/ids';

describe('newId', () => {
  test('is 26 characters long', () => {
    expect(newId(1000)).toHaveLength(26);
  });

  test('sorts lexicographically in time order', () => {
    expect(newId(1000) < newId(2000)).toBe(true);
  });

  test('stays unique and sorted within the same millisecond', () => {
    const ids = Array.from({ length: 1000 }, () => newId(5));
    expect(new Set(ids).size).toBe(1000);
    expect([...ids].sort()).toEqual(ids);
  });
});
