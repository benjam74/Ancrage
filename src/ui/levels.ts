import type { Level } from '../core/stats';

/** Colour tokens per mastery level (fill, darker relief). */
export const LEVEL_COLORS: Record<Level, [string, string]> = {
  Ancré: ['--ok', '--ok-deep'],
  Solide: ['--petrol', '--petrol-deep'],
  'En cours': ['--sun', '--sun-deep'],
  Découverte: ['--coral', '--coral-deep'],
  Nouveau: ['--ink-soft', '--line'],
};
