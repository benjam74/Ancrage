import { State } from 'ts-fsrs';
import { createEngine, type Engine } from '../core/engine';
import { newId } from '../core/ids';
import type { Card, Note, NoteFields, ReviewEntry, Theme } from '../core/model';
import { validateFields } from '../core/validate';
import { buildDailyQueue, countNewIntroduced, nextDue, studyDayStart, type QueueCandidate } from '../core/queue';
import { makeScheduler } from '../core/scheduler';
import { STARTER_THEMES, starterNotes } from '../data/starter';
import { createDexieRepo } from '../storage/dexie-repo';
import type { Repo } from '../storage/repo';

export interface Today {
  queue: string[];
  due: number;
  fresh: number;
  nextDue: number | null;
}

export interface NoteInput {
  id?: string;
  themeId: string;
  fields: NoteFields;
  tags: string[];
  source?: string;
}

/** `today`: how many of the note's cards are in today's queue (the others wait for later days). */
export type SaveResult = { ok: true; note: Note; cards: number; today: number } | { ok: false; errors: Record<string, string> };

export interface LibraryTheme {
  theme: Theme;
  notes: { note: Note; cards: number }[];
}

export interface Services {
  repo: Repo;
  engine: Engine;
  today(now: number): Promise<Today>;
  context(cardId: string): Promise<{ note: Note; card: Card; pool: Note[]; theme: Theme }>;
  saveNote(input: NoteInput, now: number): Promise<SaveResult>;
  deleteNote(id: string): Promise<void>;
  createTheme(name: string): Promise<Theme>;
  renameTheme(id: string, name: string): Promise<void>;
  deleteTheme(id: string): Promise<{ ok: boolean; reason?: string }>;
  removeExamples(): Promise<{ notes: number; themes: number }>;
  examplesCount(): Promise<number>;
  library(): Promise<LibraryTheme[]>;
  newSlotsLeft(now: number): Promise<number>;
}

const SEEDED = 'starterSeeded';
/** Starter notes are recognized by id, never by tag: a user may tag their own notes "exemple". */
const STARTER_NOTE_IDS = new Set(starterNotes(0).map((n) => n.id));
export const EXAMPLE_TAG = 'exemple';

/** Seeds the starter deck once in the database's life, so removing the examples is permanent. */
export async function seedIfEmpty(repo: Repo, now: number = Date.now()): Promise<boolean> {
  if (await repo.getFlag(SEEDED)) return false;
  if ((await repo.listNotes()).length > 0) {
    await repo.setFlag(SEEDED);
    return false;
  }
  // Starter ids are fixed, so an interrupted seed is completed on the next launch without duplicates.
  for (const theme of STARTER_THEMES) await repo.putTheme(theme);
  for (const note of starterNotes(now)) await repo.putNote(note);
  await repo.setFlag(SEEDED);
  return true;
}

export function createServices(repo: Repo, deviceId: string): Services {
  const engine = createEngine(repo, deviceId);

  const services: Services = {
    repo,
    engine,

    async today(now) {
      const [themes, notes, cards, reviews, settings] = await Promise.all([
        repo.listThemes(),
        repo.listNotes(),
        repo.listCards(),
        repo.listReviews(),
        repo.getSettings(),
      ]);
      const scheduler = makeScheduler(settings);
      const themeOrder = new Map(themes.map((t) => [t.id, t.order]));
      const noteById = new Map(notes.map((n) => [n.id, n]));
      const logByCard = new Map<string, ReviewEntry[]>();
      for (const e of reviews) logByCard.set(e.cardId, [...(logByCard.get(e.cardId) ?? []), e]);

      const candidates: QueueCandidate[] = cards.flatMap((card) => {
        const note = noteById.get(card.noteId);
        if (!note || card.orphan) return [];
        return [{
          cardId: card.id,
          themeId: note.themeId,
          themeOrder: themeOrder.get(note.themeId) ?? Number.MAX_SAFE_INTEGER,
          noteCreatedAt: note.createdAt,
          state: scheduler.replay(note.createdAt, logByCard.get(card.id) ?? []),
        }];
      });
      const newLimit = settings.newPerDay - countNewIntroduced(reviews, studyDayStart(now));
      const queue = buildDailyQueue(candidates, now, newLimit);
      const isNew = new Set(candidates.filter((c) => c.state.state === State.New).map((c) => c.cardId));
      const fresh = queue.filter((id) => isNew.has(id)).length;
      return { queue, due: queue.length - fresh, fresh, nextDue: nextDue(candidates, now) };
    },

    async context(cardId) {
      const card = await repo.getCard(cardId);
      const note = card && (await repo.getNote(card.noteId));
      if (!card || !note) throw new Error(`card ${cardId} not found`);
      const theme = (await repo.listThemes()).find((t) => t.id === note.themeId) ?? { id: note.themeId, name: 'Sans thème', order: 0 };
      const pool = (await repo.listNotes(note.themeId)).filter((n) => n.id !== note.id);
      return { note, card, pool, theme };
    },

    async saveNote(input, now) {
      const errors = validateFields(input.fields);
      if (!(await repo.listThemes()).some((t) => t.id === input.themeId)) errors.themeId = 'Ce thème n’existe plus. Choisis-en un autre.';
      if (Object.keys(errors).length) return { ok: false, errors };
      const existing = input.id ? await repo.getNote(input.id) : undefined;
      const note: Note = {
        id: existing?.id ?? newId(now),
        themeId: input.themeId,
        fields: input.fields,
        tags: [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))],
        ...(input.source?.trim() ? { source: input.source.trim() } : {}),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const cards = await repo.putNote(note);
      const queue = new Set((await services.today(now)).queue);
      return { ok: true, note, cards: cards.length, today: cards.filter((c) => queue.has(c.id)).length };
    },

    deleteNote: (id) => repo.deleteNote(id),

    async createTheme(name) {
      const clean = name.trim();
      if (!clean) throw new Error('Le nom du thème est obligatoire.');
      const themes = await repo.listThemes();
      const theme: Theme = { id: newId(), name: clean, order: Math.max(-1, ...themes.map((t) => t.order)) + 1 };
      await repo.putTheme(theme);
      return theme;
    },

    async renameTheme(id, name) {
      const clean = name.trim();
      const theme = (await repo.listThemes()).find((t) => t.id === id);
      if (!theme || !clean) return;
      await repo.putTheme({ ...theme, name: clean });
    },

    async deleteTheme(id) {
      const count = (await repo.listNotes(id)).length;
      if (count > 0) return { ok: false, reason: `Ce thème contient ${count} note${count > 1 ? 's' : ''}. Déplace-les ou supprime-les d’abord.` };
      await repo.deleteTheme(id);
      return { ok: true };
    },

    async removeExamples() {
      const examples = (await repo.listNotes()).filter((n) => STARTER_NOTE_IDS.has(n.id));
      for (const n of examples) await repo.deleteNote(n.id);
      const starterIds = new Set(STARTER_THEMES.map((t) => t.id));
      let themes = 0;
      for (const t of await repo.listThemes()) {
        if (starterIds.has(t.id) && (await repo.listNotes(t.id)).length === 0) {
          await repo.deleteTheme(t.id);
          themes++;
        }
      }
      return { notes: examples.length, themes };
    },

    async examplesCount() {
      return (await repo.listNotes()).filter((n) => STARTER_NOTE_IDS.has(n.id)).length;
    },

    async library() {
      const [themes, notes, cards] = await Promise.all([repo.listThemes(), repo.listNotes(), repo.listCards()]);
      const activeCards = new Map<string, number>();
      for (const c of cards) if (!c.orphan) activeCards.set(c.noteId, (activeCards.get(c.noteId) ?? 0) + 1);
      return [...themes]
        .sort((a, b) => a.order - b.order)
        .map((theme) => ({
          theme,
          notes: notes
            .filter((n) => n.themeId === theme.id)
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((note) => ({ note, cards: activeCards.get(note.id) ?? 0 })),
        }));
    },

    async newSlotsLeft(now) {
      const [reviews, settings] = await Promise.all([repo.listReviews(), repo.getSettings()]);
      return Math.max(0, settings.newPerDay - countNewIntroduced(reviews, studyDayStart(now)));
    },
  };
  return services;
}

function deviceId(): string {
  const key = 'ancrage.deviceId';
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const id = newId();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return newId();
  }
}

/** Opens the local database, asks the browser to keep it, and seeds the starter deck on first launch. */
export async function boot(): Promise<Services> {
  const repo = createDexieRepo('ancrage');
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Persistence is best effort; the JSON backup (iteration 5) covers eviction.
  }
  await seedIfEmpty(repo);
  return createServices(repo, deviceId());
}
