import type { ProfileColor } from '../app/profiles';

/** Profile colours, dark enough for white initials (WCAG AA). */
export const FACE: Record<ProfileColor, string> = { petrol: '#13505e', coral: '#b63c24', sun: '#8a5f00', ok: '#1f6a41', violet: '#6c3483' };
export const COLOR_LABEL: Record<ProfileColor, string> = { petrol: 'Bleu', coral: 'Corail', sun: 'Ocre', ok: 'Vert', violet: 'Violet' };

export { forgetChoice, markChosen } from '../app/current';
