import { State } from 'ts-fsrs';
import { createEngine, type Engine } from '../core/engine';
import { newId } from '../core/ids';
import type { Card, Note, ReviewEntry, Theme } from '../core/model';
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

export interface Services {
  repo: Repo;
  engine: Engine;
  today(now: number): Promise<Today>;
  context(cardId: string): Promise<{ note: Note; card: Card; pool: Note[]; theme: Theme }>;
}

export async function seedIfEmpty(repo: Repo, now: number = Date.now()): Promise<boolean> {
  if ((await repo.listNotes()).length > 0) return false;
  for (const theme of STARTER_THEMES) await repo.putTheme(theme);
  for (const note of starterNotes(now)) await repo.putNote(note);
  return true;
}

export function createServices(repo: Repo, deviceId: string): Services {
  const engine = createEngine(repo, deviceId);

  return {
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
  };
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
