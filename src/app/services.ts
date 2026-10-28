import { State } from 'ts-fsrs';
import { createEngine, type Engine } from '../core/engine';
import { newId } from '../core/ids';
import type { Card, Note, NoteFields, ReviewEntry, Theme } from '../core/model';
import { validateFields } from '../core/validate';
import { backupFileName, serializeBackup, type Dump } from '../core/backup';
import { classifyEntries, goalDays, makeRestDayCheck, nextStudyDay, streakState, weekStart, xpBetween } from '../core/progress';
import { dailyCounts, forecast, mastery, retention, stateBreakdown, type Level } from '../core/stats';
import type { CardState } from '../core/scheduler';
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

export interface ThemeProgress {
  theme: Theme;
  cards: number;
  due: number;
  mastery: number;
  level: Level;
}

export interface Progress {
  streak: number;
  freezes: number;
  todayDone: boolean;
  xpToday: number;
  xpWeek: number;
  themes: ThemeProgress[];
  /** Reviews per study day over the last 20 weeks, oldest first. */
  heatmap: number[];
  /** Cards due per study day for the next 7 days, today (with overdue) first. */
  forecast: number[];
  /** Start of each study day `forecast` covers, for labels. */
  forecastDays: number[];
  /** Share of correct answers on due cards over the last 30 days. */
  retention: number | null;
  breakdown: ReturnType<typeof stateBreakdown>;
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
  progress(now: number): Promise<Progress>;
  exportBackup(now: number): Promise<{ fileName: string; text: string }>;
  /** Replaces all local data with the backup, all or nothing. */
  importBackup(dump: Dump): Promise<void>;
  /** Records a finished round; returns the XP it earned (answers since `startedAt` + round bonus). */
  completeRound(startedAt: number, now: number): Promise<{ xp: number; streak: number; firstGoalToday: boolean }>;
}

const HEATMAP_DAYS = 20 * 7;
const FORECAST_DAYS = 7;
const RETENTION_WINDOW = 30 * 86_400_000;

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

  /** Everything progress needs, derived from the log and round events in one pass. */
  async function snapshot() {
    const [themes, notes, cards, reviews, events, settings] = await Promise.all([
      repo.listThemes(),
      repo.listNotes(),
      repo.listCards(),
      repo.listReviews(),
      repo.listEvents(),
      repo.getSettings(),
    ]);
    const scheduler = makeScheduler(settings);
    const noteById = new Map(notes.map((n) => [n.id, n]));
    const active = cards.filter((c) => !c.orphan && noteById.has(c.noteId));
    const logByCard = new Map<string, ReviewEntry[]>();
    for (const e of reviews) {
      const list = logByCard.get(e.cardId);
      if (list) list.push(e);
      else logByCard.set(e.cardId, [e]);
    }
    const states = new Map<string, CardState>(
      active.map((c) => [c.id, scheduler.replay(noteById.get(c.noteId)!.createdAt, logByCard.get(c.id) ?? [])]),
    );
    const kinds = classifyEntries(
      cards.filter((c) => noteById.has(c.noteId)).map((c) => ({ cardId: c.id, createdAt: noteById.get(c.noteId)!.createdAt })),
      reviews,
      scheduler,
    );
    const roundEnds = events.filter((e) => e.type === 'round_completed').map((e) => e.ts);
    const isRestDay = makeRestDayCheck(
      active.map((c) => ({ cardId: c.id, createdAt: noteById.get(c.noteId)!.createdAt })),
      reviews,
      scheduler,
      settings.newPerDay,
    );
    return { themes, notes, active, reviews, roundEnds, scheduler, states, kinds, noteById, isRestDay };
  }

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

    async progress(now) {
      const snap = await snapshot();
      const todayStart = studyDayStart(now);
      const streak = streakState(goalDays(snap.roundEnds), todayStart, snap.isRestDay);
      const week = weekStart(now);
      const forecastDays = [todayStart];
      while (forecastDays.length < FORECAST_DAYS) forecastDays.push(nextStudyDay(forecastDays[forecastDays.length - 1]));
      const byTheme = new Map<string, CardState[]>();
      for (const card of snap.active) {
        const t = snap.noteById.get(card.noteId)!.themeId;
        const list = byTheme.get(t);
        if (list) list.push(snap.states.get(card.id)!);
        else byTheme.set(t, [snap.states.get(card.id)!]);
      }
      const allStates = [...snap.states.values()];
      return {
        streak: streak.current,
        freezes: streak.freezes,
        todayDone: streak.todayDone,
        xpToday: xpBetween(snap.reviews, snap.kinds, snap.roundEnds, todayStart, nextStudyDay(todayStart)),
        xpWeek: xpBetween(snap.reviews, snap.kinds, snap.roundEnds, week, weekStart(week + 8 * 86_400_000)),
        themes: [...snap.themes]
          .sort((a, b) => a.order - b.order)
          .map((theme) => {
            const states = byTheme.get(theme.id) ?? [];
            const m = mastery(states, now, snap.scheduler);
            const due = states.filter((c) => c.state !== State.New && c.due.getTime() <= now).length;
            return { theme, cards: m.cards, due, mastery: m.pct, level: m.level };
          }),
        heatmap: dailyCounts(snap.reviews, todayStart, HEATMAP_DAYS),
        forecast: forecast(allStates, now, FORECAST_DAYS),
        forecastDays,
        retention: retention(snap.reviews, snap.kinds, now - RETENTION_WINDOW),
        breakdown: stateBreakdown(allStates),
      };
    },

    async exportBackup(now) {
      return { fileName: backupFileName(now), text: serializeBackup(await repo.dumpAll(), now) };
    },

    importBackup: (dump) => repo.restoreAll(dump),

    async completeRound(startedAt, now) {
      const before = await snapshot();
      const todayStart = studyDayStart(now);
      const firstGoalToday = !goalDays(before.roundEnds).includes(todayStart);
      await repo.appendEvent({ id: newId(now), type: 'round_completed', ts: now });
      const roundEnds = [...before.roundEnds, now];
      return {
        xp: xpBetween(before.reviews, before.kinds, [now], startedAt, now + 1),
        streak: streakState(goalDays(roundEnds), todayStart, before.isRestDay).current,
        firstGoalToday,
      };
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
