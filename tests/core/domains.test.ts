import { describe, expect, test } from 'vitest';
import { DEFAULT_DOMAIN_ID, groupByDomain, migrateToDomains } from '../../src/core/domains';
import type { Theme } from '../../src/core/model';

const d = (id: string, order: number): Theme => ({ id, name: id, order, kind: 'domain' });
const t = (id: string, order: number, parentId?: string): Theme => ({ id, name: id, order, ...(parentId ? { parentId } : {}) });

describe('groupByDomain', () => {
  test('domains in order with their themes, loose themes last', () => {
    const groups = groupByDomain([t('b2', 1, 'B'), d('B', 1), t('loose', 0), d('A', 0), t('a1', 0, 'A'), t('b1', 0, 'B'), t('orphan', 0, 'gone')]);
    expect(groups.map((g) => [g.domain?.id ?? null, g.themes.map((x) => x.id)])).toEqual([
      ['A', ['a1']],
      ['B', ['b1', 'b2']],
      [null, ['loose', 'orphan']],
    ]);
  });

  test('an empty domain still shows', () => {
    expect(groupByDomain([d('A', 0)])).toEqual([{ domain: d('A', 0), themes: [] }]);
  });
});

describe('migrateToDomains', () => {
  test('existing themes go into the default domain, with a fixed id', () => {
    const m = migrateToDomains([t('x', 0), t('y', 1)], 1000)!;
    expect(m.domain).toMatchObject({ id: DEFAULT_DOMAIN_ID, name: 'Coaching et PNL', kind: 'domain' });
    expect(m.moved.map((x) => [x.id, x.parentId])).toEqual([['x', DEFAULT_DOMAIN_ID], ['y', DEFAULT_DOMAIN_ID]]);
    expect(m.moved.every((x) => (x.updatedAt ?? 0) >= 1000)).toBe(true);
  });

  test('nothing to do with a domain already there, or no theme at all', () => {
    expect(migrateToDomains([d('A', 0), t('x', 0)], 1)).toBeNull();
    expect(migrateToDomains([], 1)).toBeNull();
  });
});
