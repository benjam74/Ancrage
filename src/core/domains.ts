import type { Theme } from './model';

/** Two levels: domains (« Mathématiques », « Coaching et PNL ») group themes (chapters). */

export const DEFAULT_DOMAIN_ID = 'dom-principal';
export const DEFAULT_DOMAIN_NAME = 'Coaching et PNL';

export const isDomain = (t: Theme) => t.kind === 'domain';

export interface DomainGroup {
  /** `null` gathers the themes that belong to no domain. */
  domain: Theme | null;
  themes: Theme[];
}

/** Domains in their order, each with its themes in order; themes without a known domain come last. */
export function groupByDomain(all: Theme[]): DomainGroup[] {
  const byOrder = (a: Theme, b: Theme) => a.order - b.order || a.name.localeCompare(b.name, 'fr');
  const domains = all.filter(isDomain).sort(byOrder);
  const ids = new Set(domains.map((d) => d.id));
  const themes = all.filter((t) => !isDomain(t)).sort(byOrder);
  const groups: DomainGroup[] = domains.map((domain) => ({ domain, themes: themes.filter((t) => t.parentId === domain.id) }));
  const loose = themes.filter((t) => !t.parentId || !ids.has(t.parentId));
  if (loose.length) groups.push({ domain: null, themes: loose });
  return groups;
}

/**
 * One-time migration: with no domain yet, the existing themes go into a default domain. Its id is fixed,
 * so two devices migrating on their own end up with the same domain after a merge.
 */
export function migrateToDomains(themes: Theme[], now: number): { domain: Theme; moved: Theme[] } | null {
  if (themes.some(isDomain) || themes.length === 0) return null;
  const domain: Theme = { id: DEFAULT_DOMAIN_ID, name: DEFAULT_DOMAIN_NAME, order: 0, kind: 'domain', updatedAt: now };
  const moved = themes.filter((t) => !t.parentId).map((t) => ({ ...t, parentId: DEFAULT_DOMAIN_ID, updatedAt: Math.max(now, (t.updatedAt ?? 0) + 1) }));
  return { domain, moved };
}
