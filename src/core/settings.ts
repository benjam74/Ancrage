import type { Settings } from './model';

export const RETENTION_MIN = 0.7;
export const RETENTION_MAX = 0.97;
export const NEW_PER_DAY_MAX = 50;

const toNumber = (v: string | number) => (typeof v === 'number' ? v : v.trim() === '' ? NaN : Number(v.trim().replace(',', '.')));

export function validateSettings(input: { desiredRetention: string | number; newPerDay: string | number }):
  | { ok: true; settings: Settings }
  | { ok: false; errors: Partial<Record<keyof Settings, string>> } {
  const desiredRetention = toNumber(input.desiredRetention);
  const newPerDay = toNumber(input.newPerDay);
  const errors: Partial<Record<keyof Settings, string>> = {};
  if (!(desiredRetention >= RETENTION_MIN && desiredRetention <= RETENTION_MAX)) {
    errors.desiredRetention = 'La rétention visée doit être entre 0,70 et 0,97.';
  }
  if (!(Number.isInteger(newPerDay) && newPerDay >= 0 && newPerDay <= NEW_PER_DAY_MAX)) {
    errors.newPerDay = 'Le nombre de nouvelles cartes doit être un entier entre 0 et 50.';
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, settings: { desiredRetention, newPerDay } };
}
