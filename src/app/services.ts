import { State } from 'ts-fsrs';
import { createEngine, type Engine } from '../core/engine';
import { newId } from '../core/ids';
import type { Card, CharacterId, Note, NoteFields, ReviewEntry, Slot, Theme } from '../core/model';
import { validateFields } from '../core/validate';
import { validateSettings } from '../core/settings';
import { backupFileName, serializeBackup, type Dump } from '../core/backup';
import { mergeIntoLocal } from '../sync/sync';
import { CATALOG } from '../data/items';
import { CHARACTER_NAMES, NAME_MAX, avatarOf, outfit, owned, resale, wallet } from '../core/shop';
import { capNewXp, classifyEntries, comebackRounds, goalDays, makeRestDayCheck, nextStudyDay, roundsPerDay, streakState, weekStart, weekStrip, xpBetween, type StripDay } from '../core/progress';
import { dailyCounts, forecast, mastery, nextLevel, retention, stateBreakdown, type Level } from '../core/stats';
import type { CardState } from '../core/scheduler';
import { buildCustomQueue, buildDailyQueue, countNewIntroduced, nextDue, studyDayStart, type CustomChoice, type QueueCandidate } from '../core/queue';
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
  /** Cards never studied yet. */
  fresh: number;
  /** Next level and the mastered cards still needed; null once anchored or empty. */
  next: { level: Level; remaining: number } | null;
}

export interface ShopState {
  /** XP earned since the first round, the same rules as every XP figure. */
  earned: number;
  balance: number;
  owned: Set<string>;
  outfit: Partial<Record<Slot, string>>;
  avatar: { character: CharacterId; name: string };
  /** Whether a character was ever chosen. */
  chosen: boolean;
}

export interface RoundOutcome {
  xp: number;
  streak: number;
  firstGoalToday: boolean;
  /** This round earned the comeback bonus. */
  comeback: boolean;
  /** This round repaired yesterday's missed day. */
  repaired: boolean;
  /** Streak milestone reached by this round (7, 30, 100, 365). */
  milestone: number | null;
}

export const MILESTONES = [7, 30, 100, 365];

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
  /** Longest streak ever reached. */
  best: number;
  /** Monday to Sunday of the current week. */
  week: StripDay[];
  /** Yesterday broke a streak that today can still repair with REPAIR_ROUNDS rounds. */
  repair: { lost: number; rounds: number } | null;
  /** The next round would earn the comeback bonus. */
  comebackReady: boolean;
  roundsToday: number;
  answersToday: number;
  /** XP per week over up to 4 previous weeks since the first round; null without any. */
  xpPrevAvg: number | null;
  xpPrevBest: number | null;
  /** A lapsed learner back on a Monday or on the 1st of the month. */
  freshStart: 'week' | 'month' | null;
}

export interface Services {
  repo: Repo;
  engine: Engine;
  today(now: number): Promise<Today>;
  /** Wallet (XP earned since the start − purchases + sales), inventory, outfit and character. */
  shop(now: number): Promise<ShopState>;
  buy(itemId: string, now: number): Promise<{ ok: true } | { ok: false; error: string }>;
  sell(itemId: string, now: number): Promise<{ ok: true; refund: number } | { ok: false; error: string }>;
  equip(slot: Slot, itemId: string | null, now: number): Promise<void>;
  setAvatar(character: CharacterId, name: string, now: number): Promise<void>;
  /** A session the learner picks (themes, mode, count); ignores the daily new-card limit. */
  custom(now: number, choice: CustomChoice): Promise<string[]>;
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
  updateSettings(input: { desiredRetention: string | number; newPerDay: string | number }): Promise<ReturnType<typeof validateSettings>>;
  exportBackup(now: number): Promise<{ fileName: string; text: string }>;
  /** Replaces all local data with the backup, all or nothing. */
  importBackup(dump: Dump): Promise<void>;
  /** Merges a backup from another device into local data; nothing local is lost. */
  mergeBackup(dump: Dump): Promise<void>;
  /** Records a finished round; returns the XP it earned (answers since `startedAt` + round bonus). */
  completeRound(startedAt: number, now: number): Promise<RoundOutcome>;
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
    const kinds = capNewXp(
      classifyEntries(
        cards.filter((c) => noteById.has(c.noteId)).map((c) => ({ cardId: c.id, createdAt: noteById.get(c.noteId)!.createdAt })),
        reviews,
        scheduler,
      ),
      reviews,
    );
    const roundEnds = events.filter((e) => e.type === 'round_completed').map((e) => e.ts);
    const isRestDay = makeRestDayCheck(
      active.map((c) => ({ cardId: c.id, createdAt: noteById.get(c.noteId)!.createdAt })),
      reviews,
      scheduler,
      settings.newPerDay,
    );
    return { themes, notes, active, reviews, events, roundEnds, scheduler, states, kinds, noteById, isRestDay };
  }

  function streakOf(snap: Awaited<ReturnType<typeof snapshot>>, roundEnds: number[], todayStart: number) {
    const perDay = roundsPerDay(roundEnds);
    return streakState(goalDays(roundEnds), todayStart, snap.isRestDay, (d) => perDay.get(d) ?? 0);
  }

  /** Every active card with its replayed state, for building queues. */
  async function candidatesNow() {
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
    for (const e of reviews) {
      const list = logByCard.get(e.cardId);
      if (list) list.push(e);
      else logByCard.set(e.cardId, [e]);
    }

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
    return { candidates, reviews, settings, scheduler };
  }

  /** Deleting a note deletes its reviews: the XP they earned stays in the wallet as a credit. */
  async function keepXp(noteIds: string[]) {
    const snap = await snapshot();
    const cards = await repo.listCards();
    const existing = new Set(snap.events.map((e) => e.id));
    for (const noteId of noteIds) {
      const cardIds = new Set(cards.filter((c) => c.noteId === noteId).map((c) => c.id));
      const xp = xpBetween(snap.reviews.filter((e) => cardIds.has(e.cardId)), snap.kinds, [], -Infinity, Infinity);
      const id = `credit:${noteId}`;
      if (xp > 0 && !existing.has(id)) await repo.appendEvent({ id, type: 'xp_credit', ts: Date.now(), xp });
    }
  }

  const services: Services = {
    repo,
    engine,

    async today(now) {
      const { candidates, reviews, settings } = await candidatesNow();
      const newLimit = settings.newPerDay - countNewIntroduced(reviews, studyDayStart(now));
      const queue = buildDailyQueue(candidates, now, newLimit);
      const isNew = new Set(candidates.filter((c) => c.state.state === State.New).map((c) => c.cardId));
      const fresh = queue.filter((id) => isNew.has(id)).length;
      return { queue, due: queue.length - fresh, fresh, nextDue: nextDue(candidates, now) };
    },

    async custom(now, choice) {
      const { candidates, scheduler } = await candidatesNow();
      return buildCustomQueue(candidates, now, choice, (c) => scheduler.retrievability(c.state, now));
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
        // A device whose clock is behind must still produce the newest version.
        updatedAt: Math.max(now, (existing?.updatedAt ?? 0) + 1),
      };
      const cards = await repo.putNote(note);
      const queue = new Set((await services.today(now)).queue);
      return { ok: true, note, cards: cards.length, today: cards.filter((c) => queue.has(c.id)).length };
    },

    async deleteNote(id) {
      const note = await repo.getNote(id);
      await keepXp([id]);
      await repo.deleteNote(id, Math.max(Date.now(), (note?.updatedAt ?? 0) + 1));
    },

    async createTheme(name) {
      const clean = name.trim();
      if (!clean) throw new Error('Le nom du thème est obligatoire.');
      const themes = await repo.listThemes();
      const theme: Theme = { id: newId(), name: clean, order: Math.max(-1, ...themes.map((t) => t.order)) + 1, updatedAt: Date.now() };
      await repo.putTheme(theme);
      return theme;
    },

    async renameTheme(id, name) {
      const clean = name.trim();
      const theme = (await repo.listThemes()).find((t) => t.id === id);
      if (!theme || !clean) return;
      await repo.putTheme({ ...theme, name: clean, updatedAt: Math.max(Date.now(), (theme.updatedAt ?? 0) + 1) });
    },

    async deleteTheme(id) {
      const count = (await repo.listNotes(id)).length;
      if (count > 0) return { ok: false, reason: `Ce thème contient ${count} note${count > 1 ? 's' : ''}. Déplace-les ou supprime-les d’abord.` };
      const theme = (await repo.listThemes()).find((t) => t.id === id);
      await repo.deleteTheme(id, Math.max(Date.now(), (theme?.updatedAt ?? 0) + 1));
      return { ok: true };
    },

    async removeExamples() {
      const examples = (await repo.listNotes()).filter((n) => STARTER_NOTE_IDS.has(n.id));
      await keepXp(examples.map((n) => n.id));
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
      const streak = streakOf(snap, snap.roundEnds, todayStart);
      const bonus = comebackRounds(snap.roundEnds);
      const week = weekStart(now);
      const prevWeeks: number[] = [];
      if (snap.roundEnds.length) {
        const first = weekStart(Math.min(...snap.roundEnds));
        for (let w = weekStart(week - 12 * 3_600_000); w >= first && prevWeeks.length < 4; w = weekStart(w - 12 * 3_600_000)) {
          prevWeeks.push(xpBetween(snap.reviews, snap.kinds, snap.roundEnds, w, weekStart(w + 8 * 86_400_000), bonus));
        }
      }
      const date = new Date(todayStart);
      const lapsed = streak.current === 0 && !streak.todayDone && snap.roundEnds.length > 0;
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
        xpToday: xpBetween(snap.reviews, snap.kinds, snap.roundEnds, todayStart, nextStudyDay(todayStart), bonus),
        xpWeek: xpBetween(snap.reviews, snap.kinds, snap.roundEnds, week, weekStart(week + 8 * 86_400_000), bonus),
        themes: [...snap.themes]
          .sort((a, b) => a.order - b.order)
          .map((theme) => {
            const states = byTheme.get(theme.id) ?? [];
            const m = mastery(states, now, snap.scheduler);
            const due = states.filter((c) => c.state !== State.New && c.due.getTime() <= now).length;
            const next = nextLevel(m.cards, m.mastered, m.level !== 'Nouveau');
            const fresh = states.filter((c) => c.state === State.New).length;
            return { theme, cards: m.cards, due, fresh, mastery: m.pct, level: m.level, next };
          }),
        heatmap: dailyCounts(snap.reviews, todayStart, HEATMAP_DAYS),
        forecast: forecast(allStates, now, FORECAST_DAYS),
        forecastDays,
        retention: retention(snap.reviews, snap.kinds, now - RETENTION_WINDOW),
        breakdown: stateBreakdown(allStates),
        best: streak.best,
        week: weekStrip(streak.history, todayStart, streak.todayDone),
        repair: streak.repair,
        comebackReady: comebackRounds([...snap.roundEnds, now]).includes(now),
        roundsToday: snap.roundEnds.filter((ts) => studyDayStart(ts) === todayStart).length,
        answersToday: snap.reviews.filter((e) => studyDayStart(e.ts) === todayStart).length,
        xpPrevAvg: prevWeeks.length ? Math.round(prevWeeks.reduce((a, b) => a + b, 0) / prevWeeks.length) : null,
        xpPrevBest: prevWeeks.length ? Math.max(...prevWeeks) : null,
        freshStart: !lapsed ? null : date.getDate() === 1 ? 'month' : date.getDay() === 1 ? 'week' : null,
      };
    },

    async updateSettings(input) {
      const res = validateSettings(input);
      if (res.ok) await repo.putSettings(res.settings);
      return res;
    },

    async exportBackup(now) {
      return { fileName: backupFileName(now), text: serializeBackup(await repo.dumpAll(), now) };
    },

    importBackup: (dump) => repo.restoreAll(dump),

    async mergeBackup(dump) {
      await mergeIntoLocal(repo, dump);
    },

    async completeRound(startedAt, now) {
      const before = await snapshot();
      const todayStart = studyDayStart(now);
      const firstGoalToday = !goalDays(before.roundEnds).includes(todayStart);
      await repo.appendEvent({ id: newId(now), type: 'round_completed', ts: now });
      const roundEnds = [...before.roundEnds, now];
      const prev = streakOf(before, before.roundEnds, todayStart);
      const after = streakOf(before, roundEnds, todayStart);
      const comeback = comebackRounds(roundEnds).includes(now);
      const yesterday = studyDayStart(todayStart - 12 * 3_600_000);
      return {
        xp: xpBetween(before.reviews, before.kinds, [now], startedAt, now + 1, comeback ? [now] : []),
        streak: after.current,
        firstGoalToday,
        comeback,
        repaired: after.history.get(yesterday) === 'repaired' && prev.history.get(yesterday) !== 'repaired',
        milestone: after.current !== prev.current && MILESTONES.includes(after.current) ? after.current : null,
      };
    },

    async shop() {
      const snap = await snapshot();
      const earned = xpBetween(snap.reviews, snap.kinds, snap.roundEnds, -Infinity, Infinity, comebackRounds(snap.roundEnds));
      const credits = snap.events.reduce((n, e) => n + (e.type === 'xp_credit' ? e.xp : 0), 0);
      return {
        // Shown to the learner: XP kept from deleted notes counts as earned.
        earned: earned + credits,
        balance: wallet(earned, snap.events),
        owned: owned(snap.events),
        outfit: outfit(snap.events),
        avatar: avatarOf(snap.events),
        chosen: snap.events.some((e) => e.type === 'avatar'),
      };
    },

    async buy(itemId, now) {
      const item = CATALOG.find((i) => i.id === itemId);
      if (!item) return { ok: false, error: 'Cet objet n’existe pas.' };
      const state = await services.shop(now);
      if (state.owned.has(itemId)) return { ok: false, error: 'Tu as déjà cet objet.' };
      if (state.balance < item.price) return { ok: false, error: `Il te manque ${item.price - Math.max(0, state.balance)} XP.` };
      await repo.appendEvent({ id: newId(now), type: 'purchase', ts: now, itemId, price: item.price });
      await repo.appendEvent({ id: newId(now), type: 'equip', ts: now, slot: item.slot, itemId });
      return { ok: true };
    },

    async sell(itemId, now) {
      const events = await repo.listEvents();
      const paid = events.filter((e) => e.type === 'purchase' && e.itemId === itemId).sort((a, b) => a.ts - b.ts).pop();
      if (!owned(events).has(itemId) || !paid || paid.type !== 'purchase') return { ok: false, error: 'Tu n’as pas cet objet.' };
      const refund = resale(paid.price);
      await repo.appendEvent({ id: newId(now), type: 'sale', ts: now, itemId, refund });
      return { ok: true, refund };
    },

    async equip(slot, itemId, now) {
      if (itemId !== null && (CATALOG.find((i) => i.id === itemId)?.slot !== slot || !owned(await repo.listEvents()).has(itemId))) return;
      await repo.appendEvent({ id: newId(now), type: 'equip', ts: now, slot, itemId });
    },

    async setAvatar(character, name, now) {
      const clean = name.trim().slice(0, NAME_MAX) || CHARACTER_NAMES[character];
      await repo.appendEvent({ id: newId(now), type: 'avatar', ts: now, character, name: clean });
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
