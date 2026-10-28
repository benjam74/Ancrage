import type { AppEvent, Card, Note, ReviewEntry, Settings, Theme } from './model';

export const BACKUP_FORMAT = 'ancrage-backup';
export const BACKUP_VERSION = 1;

/** A full snapshot of the local database. */
export interface Dump {
  themes: Theme[];
  notes: Note[];
  cards: Card[];
  reviews: ReviewEntry[];
  events: AppEvent[];
  settings: Settings;
  flags: string[];
}

export function serializeBackup(dump: Dump, now: number): string {
  return JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, ...dump });
}

export function backupFileName(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `ancrage-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

export function summarize(dump: Dump): { themes: number; notes: number; reviews: number } {
  return { themes: dump.themes.length, notes: dump.notes.length, reviews: dump.reviews.length };
}

const NOTE_TYPES = ['basic', 'cloze', 'ordering', 'classify', 'mcq', 'scenario'];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown) => typeof v === 'string';
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

const CHECKS: Record<'themes' | 'notes' | 'cards' | 'reviews' | 'events', (r: Record<string, unknown>) => boolean> = {
  themes: (r) => isStr(r.id) && isStr(r.name) && isNum(r.order),
  notes: (r) =>
    isStr(r.id) && isStr(r.themeId) && isObj(r.fields) && NOTE_TYPES.includes(r.fields.type as string) &&
    Array.isArray(r.tags) && isNum(r.createdAt) && isNum(r.updatedAt),
  cards: (r) => isStr(r.id) && isStr(r.noteId) && isStr(r.variant),
  reviews: (r) =>
    isStr(r.id) && isStr(r.cardId) && isNum(r.ts) && [1, 2, 3, 4].includes(r.rating as number) &&
    ['recognition', 'production', 'self'].includes(r.mode as string) && typeof r.correct === 'boolean',
  events: (r) => isStr(r.id) && r.type === 'round_completed' && isNum(r.ts),
};
const LABELS = { themes: 'thèmes', notes: 'notes', cards: 'cartes', reviews: 'révisions', events: 'manches' } as const;

export function parseBackup(text: string): { ok: true; dump: Dump; exportedAt: number } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Ce fichier n’est pas un JSON lisible.' };
  }
  if (!isObj(data) || data.format !== BACKUP_FORMAT) return { ok: false, error: 'Ce fichier n’est pas une sauvegarde Ancrage.' };
  if (!isNum(data.version) || (data.version as number) > BACKUP_VERSION) {
    return { ok: false, error: 'Cette sauvegarde vient d’une version plus récente d’Ancrage. Mets l’application à jour.' };
  }
  for (const table of Object.keys(CHECKS) as (keyof typeof CHECKS)[]) {
    const rows = data[table];
    if (!Array.isArray(rows)) return { ok: false, error: `Sauvegarde incomplète : la liste des ${LABELS[table]} manque.` };
    const bad = rows.findIndex((r) => !isObj(r) || !CHECKS[table](r));
    if (bad >= 0) return { ok: false, error: `Sauvegarde abîmée : l’élément ${bad + 1} des ${LABELS[table]} est invalide.` };
  }
  const settings = data.settings;
  if (!isObj(settings) || !isNum(settings.desiredRetention) || !isNum(settings.newPerDay)) {
    return { ok: false, error: 'Sauvegarde abîmée : les réglages sont invalides.' };
  }
  if (!Array.isArray(data.flags) || !data.flags.every(isStr)) return { ok: false, error: 'Sauvegarde abîmée : les marqueurs sont invalides.' };
  const { format: _f, version: _v, exportedAt, ...rest } = data;
  return { ok: true, dump: rest as unknown as Dump, exportedAt: isNum(exportedAt) ? (exportedAt as number) : 0 };
}
