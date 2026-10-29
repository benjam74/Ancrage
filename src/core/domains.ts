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

/**
 * The domain a theme is shown in: its parent when that domain exists; otherwise the default domain when
 * it exists (themes from before domains, or from a device not updated yet); otherwise none.
 */
export function domainOf(theme: Theme, domainIds: Set<string>): string | null {
  if (theme.parentId && domainIds.has(theme.parentId)) return theme.parentId;
  return domainIds.has(DEFAULT_DOMAIN_ID) ? DEFAULT_DOMAIN_ID : null;
}

/** Domains in their order, each with its themes in order; themes without a known domain come last. */
export function groupByDomain(all: Theme[]): DomainGroup[] {
  const byOrder = (a: Theme, b: Theme) => a.order - b.order || a.name.localeCompare(b.name, 'fr');
  const domains = all.filter(isDomain).sort(byOrder);
  const ids = new Set(domains.map((d) => d.id));
  const themes = all.filter((t) => !isDomain(t)).sort(byOrder);
  const groups: DomainGroup[] = domains.map((domain) => ({ domain, themes: themes.filter((t) => domainOf(t, ids) === domain.id) }));
  const loose = themes.filter((t) => domainOf(t, ids) === null);
  if (loose.length) groups.push({ domain: null, themes: loose });
  return groups;
}

/**
 * With themes but no domain yet, creates the default domain; the themes are then shown in it (domainOf)
 * without being rewritten, so this never outranks an edit made on another device. Its id is fixed and its
 * date the oldest possible: two devices create the same domain, and a rename made anywhere wins.
 */
export function migrateToDomains(themes: Theme[]): Theme | null {
  if (themes.some(isDomain) || themes.length === 0) return null;
  return { id: DEFAULT_DOMAIN_ID, name: DEFAULT_DOMAIN_NAME, order: 0, kind: 'domain', updatedAt: 0 };
}
