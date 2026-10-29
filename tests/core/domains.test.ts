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
  test('creates the default domain, oldest possible, and the loose themes show in it without being rewritten', () => {
    const themes = [t('x', 0), t('y', 1)];
    const dom = migrateToDomains(themes)!;
    expect(dom).toEqual({ id: DEFAULT_DOMAIN_ID, name: 'Coaching et PNL', order: 0, kind: 'domain', updatedAt: 0 });
    expect(groupByDomain([...themes, dom]).map((g) => [g.domain?.id, g.themes.map((x) => x.id)])).toEqual([[DEFAULT_DOMAIN_ID, ['x', 'y']]]);
  });

  test('nothing to do with a domain already there, or no theme at all', () => {
    expect(migrateToDomains([d('A', 0), t('x', 0)])).toBeNull();
    expect(migrateToDomains([])).toBeNull();
  });
});
