import { LANGS } from './model';
import type { AppEvent, Card, Note, ReviewEntry, Settings, Theme, Tombstone } from './model';
import { validateSettings } from './settings';

export const BACKUP_FORMAT = 'ancrage-backup';
// Version 3 adds the shop events, version 4 image notes and theme languages; older apps then ask to be updated instead of calling the file damaged.
export const BACKUP_VERSION = 4;

/** A full snapshot of the local database. */
export interface Dump {
  themes: Theme[];
  notes: Note[];
  cards: Card[];
  reviews: ReviewEntry[];
  events: AppEvent[];
  settings: Settings;
  flags: string[];
  tombstones: Tombstone[];
  /** When the settings were last changed (0: never), for last-writer-wins sync. */
  settingsUpdatedAt: number;
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

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown) => typeof v === 'string';
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const isStrList = (v: unknown) => Array.isArray(v) && v.every(isStr);

/** Field shape per note type, so a restored note can never crash the session or the library. */
const FIELD_SHAPES: Record<string, Record<string, (v: unknown) => boolean>> = {
  basic: { front: isStr, back: isStr, reverse: (v) => typeof v === 'boolean' },
  cloze: { text: isStr },
  ordering: { title: isStr, steps: isStrList },
  classify: { statement: isStr, categories: isStrList, answer: isStr },
  mcq: { question: isStr, answer: isStr, distractors: isStrList },
  scenario: { situation: isStr, model: isStr, keyPoints: isStrList },
  image: {
    title: isStr,
    image: (v) => isStr(v) && (v as string).startsWith('data:image/'),
    masks: (v) => Array.isArray(v) && v.every((m) => isObj(m) && isStr(m.id) && isStr(m.label) && ['x', 'y', 'w', 'h'].every((k) => isNum(m[k]))),
  },
};
const fieldsOk = (f: unknown) =>
  isObj(f) && isStr(f.type) && !!FIELD_SHAPES[f.type as string] &&
  Object.entries(FIELD_SHAPES[f.type as string]).every(([key, ok]) => ok(f[key]));

const SLOT_IDS = ['haut', 'bas', 'chapeau', 'lunettes', 'cou', 'objet', 'compagnon', 'decor'];
const CHARACTER_IDS = ['renard', 'loutre', 'ourson', 'lapin'];
const EVENT_SHAPES: Record<string, (r: Record<string, unknown>) => boolean> = {
  round_completed: () => true,
  purchase: (r) => isStr(r.itemId) && isNum(r.price),
  sale: (r) => isStr(r.itemId) && isNum(r.refund),
  equip: (r) => SLOT_IDS.includes(r.slot as string) && (r.itemId === null || isStr(r.itemId)),
  avatar: (r) => CHARACTER_IDS.includes(r.character as string) && isStr(r.name),
  xp_credit: (r) => isNum(r.xp),
};
const knownEvent = (type: unknown) => isStr(type) && Object.hasOwn(EVENT_SHAPES, type);

const CHECKS: Record<'themes' | 'notes' | 'cards' | 'reviews' | 'events', (r: Record<string, unknown>) => boolean> = {
  themes: (r) =>
    isStr(r.id) && isStr(r.name) && isNum(r.order) && (r.parentId === undefined || isStr(r.parentId)) && (r.kind === undefined || r.kind === 'domain') && (r.lang === undefined || (LANGS as readonly unknown[]).includes(r.lang)) && (r.newOrder === undefined || r.newOrder === 'mixed' || r.newOrder === 'chapter') &&
    (r.updatedAt === undefined || isNum(r.updatedAt)),
  notes: (r) =>
    isStr(r.id) && isStr(r.themeId) && fieldsOk(r.fields) && isStrList(r.tags) &&
    (r.source === undefined || isStr(r.source)) && (r.suspended === undefined || typeof r.suspended === 'boolean') && (r.explanation === undefined || isStr(r.explanation)) && isNum(r.createdAt) && isNum(r.updatedAt),
  cards: (r) => isStr(r.id) && isStr(r.noteId) && isStr(r.variant) && (r.orphan === undefined || typeof r.orphan === 'boolean'),
  reviews: (r) =>
    isStr(r.id) && isStr(r.cardId) && isNum(r.ts) && [1, 2, 3, 4].includes(r.rating as number) &&
    ['recognition', 'production', 'self'].includes(r.mode as string) && typeof r.correct === 'boolean' &&
    isNum(r.durationMs) && typeof r.hintUsed === 'boolean' && isStr(r.deviceId),
  // Types from a later version are kept as they are (so syncing never deletes them) and ignored by readers.
  events: (r) => isStr(r.id) && isNum(r.ts) && isStr(r.type) && (!knownEvent(r.type) || EVENT_SHAPES[r.type as string](r)),
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
  if (!Number.isInteger(data.version) || (data.version as number) < 1) return { ok: false, error: 'Sauvegarde abîmée : sa version est illisible.' };
  if ((data.version as number) > BACKUP_VERSION) {
    return { ok: false, error: 'Cette sauvegarde vient d’une version plus récente d’Ancrage. Mets l’application à jour.' };
  }
  for (const table of Object.keys(CHECKS) as (keyof typeof CHECKS)[]) {
    const rows = data[table];
    if (!Array.isArray(rows)) return { ok: false, error: `Sauvegarde incomplète : la liste des ${LABELS[table]} manque.` };
    const bad = rows.findIndex((r) => !isObj(r) || !CHECKS[table](r));
    if (bad >= 0) return { ok: false, error: `Sauvegarde abîmée : l’élément ${bad + 1} des ${LABELS[table]} est invalide.` };
    if (new Set(rows.map((r) => r.id)).size !== rows.length) return { ok: false, error: `Sauvegarde abîmée : des ${LABELS[table]} sont en double.` };
  }
  const themeIds = new Set((data.themes as Theme[]).map((t) => t.id));
  const noteIds = new Set((data.notes as Note[]).map((n) => n.id));
  if ((data.notes as Note[]).some((n) => !themeIds.has(n.themeId))) return { ok: false, error: 'Sauvegarde abîmée : une note appartient à un thème absent.' };
  if ((data.cards as Card[]).some((c) => !noteIds.has(c.noteId))) return { ok: false, error: 'Sauvegarde abîmée : une carte appartient à une note absente.' };
  const raw = isObj(data.settings) ? data.settings : {};
  const settings = validateSettings({ desiredRetention: raw.desiredRetention as number, newPerDay: raw.newPerDay as number });
  if (!settings.ok) return { ok: false, error: 'Sauvegarde abîmée : les réglages sont invalides.' };
  if (!isStrList(data.flags)) return { ok: false, error: 'Sauvegarde abîmée : les marqueurs sont invalides.' };
  // Version 1 had no sync data.
  const tombstones = data.tombstones ?? [];
  if (!Array.isArray(tombstones) || !tombstones.every((t) => isObj(t) && isStr(t.id) && (t.kind === 'note' || t.kind === 'theme') && isNum(t.ts))) {
    return { ok: false, error: 'Sauvegarde abîmée : les suppressions enregistrées sont invalides.' };
  }
  const settingsUpdatedAt = data.settingsUpdatedAt ?? 0;
  if (!isNum(settingsUpdatedAt)) return { ok: false, error: 'Sauvegarde abîmée : les réglages sont invalides.' };
  const dump: Dump = {
    themes: data.themes as Theme[],
    notes: data.notes as Note[],
    cards: data.cards as Card[],
    reviews: data.reviews as ReviewEntry[],
    events: data.events as AppEvent[],
    settings: settings.settings,
    flags: data.flags as string[],
    tombstones: tombstones as Tombstone[],
    settingsUpdatedAt: settingsUpdatedAt as number,
  };
  return { ok: true, dump, exportedAt: isNum(data.exportedAt) ? (data.exportedAt as number) : 0 };
}
