import type { ThemeProgress } from '../app/services';
import type { Level } from '../core/stats';

/** Colour tokens per mastery level: fill, darker relief, readable text on the fill. */
export const LEVEL_COLORS: Record<Level, [string, string, string]> = {
  Ancré: ['--ok', '--ok-deep', '--on-ok'],
  Solide: ['--petrol', '--petrol-deep', '--on-petrol'],
  'En cours': ['--sun', '--sun-deep', '--on-sun'],
  Découverte: ['--coral', '--coral-deep', '--on-coral'],
  Nouveau: ['--ink-soft', '--line', '--on-ink-soft'],
};

/** Path node to highlight: the started theme closest to its next level, else the first with cards. */
export function activeTheme(themes: ThemeProgress[]): ThemeProgress | undefined {
  return [...themes]
    .filter((t) => t.cards > 0 && t.next)
    .sort((a, b) => Number(a.level === 'Nouveau') - Number(b.level === 'Nouveau') || a.next!.remaining - b.next!.remaining)[0];
}

export function nextText(t: ThemeProgress): string {
  if (!t.next) return '';
  if (t.level === 'Nouveau') return 'Commence pour découvrir';
  return `Plus que ${t.next.remaining} carte${t.next.remaining > 1 ? 's' : ''} pour passer ${t.next.level}`;
}
