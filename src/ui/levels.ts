import type { Level } from '../core/stats';

/** Colour tokens per mastery level: fill, darker relief, readable text on the fill. */
export const LEVEL_COLORS: Record<Level, [string, string, string]> = {
  Ancré: ['--ok', '--ok-deep', '--on-ok'],
  Solide: ['--petrol', '--petrol-deep', '--on-petrol'],
  'En cours': ['--sun', '--sun-deep', '--on-sun'],
  Découverte: ['--coral', '--coral-deep', '--on-coral'],
  Nouveau: ['--ink-soft', '--line', '--on-ink-soft'],
};
