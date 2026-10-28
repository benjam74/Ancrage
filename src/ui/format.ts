const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function inHowLong(target: number, now: number): string {
  const d = Math.max(0, target - now);
  if (d < HOUR) return `dans ${Math.max(1, Math.round(d / MIN))} min`;
  if (d < DAY) return `dans ${Math.round(d / HOUR)} h`;
  if (d < 31 * DAY) return `dans ${Math.round(d / DAY)} j`;
  if (d < 365 * DAY) return `dans ${Math.round(d / (30 * DAY))} mois`;
  const years = Math.round(d / (365 * DAY));
  return `dans ${years} an${years > 1 ? 's' : ''}`;
}

export const RATING_LABEL = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' } as const;
export const MODE_LABEL = { recognition: 'Reconnaissance', production: 'Production', self: 'Auto-évaluation' } as const;

export const TYPE_LABEL = {
  basic: 'Recto / verso',
  cloze: 'Texte à trous',
  ordering: 'Remettre en ordre',
  classify: 'Classement',
  mcq: 'QCM',
  scenario: 'Mise en situation',
} as const;
