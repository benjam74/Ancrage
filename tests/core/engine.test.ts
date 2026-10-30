import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { State } from 'ts-fsrs';
import { createEngine, type Engine } from '../../src/core/engine';
import { makeScheduler } from '../../src/core/scheduler';
import { newId } from '../../src/core/ids';
import { DEFAULT_SETTINGS, type Card, type Note } from '../../src/core/model';
import type { Outcome } from '../../src/core/grading';
import { createDexieRepo } from '../../src/storage/dexie-repo';
import type { Repo } from '../../src/storage/repo';

const T0 = Date.UTC(2026, 9, 1, 8);
const DAY = 86_400_000;
const ok = (durationMs = 3000): Outcome => ({ kind: 'auto', correct: true, durationMs, hintUsed: false });
const wrong: Outcome = { kind: 'auto', correct: false, durationMs: 3000, hintUsed: false };

let repo: Repo;
let engine: Engine;

async function addCloze(text: string, id = newId(T0)): Promise<Card[]> {
  const note: Note = { id, themeId: 't1', fields: { type: 'cloze', text }, tags: [], createdAt: T0, updatedAt: T0 };
  return repo.putNote(note);
}

beforeEach(() => {
  repo = createDexieRepo(`engine-${newId()}`);
  engine = createEngine(repo, 'device-1');
});

describe('engine', () => {
  test('a new cloze card is shown as recognition and a correct answer is rated Hard', async () => {
    const [card] = await addCloze('GROW : Goal, {{Reality}}, Options, Will');
    expect(await engine.modeFor(card.id)).toBe('recognition');
    const { entry } = await engine.answer(card.id, 'recognition', ok(), T0);
    expect(entry).toMatchObject({ cardId: card.id, rating: 2, mode: 'recognition', correct: true, deviceId: 'device-1' });
  });

  test('a fast production answer becomes Easy once 5 durations are known for the note type', async () => {
    const cards = await addCloze('{{a}} {{b}} {{c}} {{d}} {{e}} {{f}}');
    const durations = [2000, 3000, 4000, 5000, 6000];
    for (let i = 0; i < durations.length; i++) {
      await engine.answer(cards[i].id, 'production', ok(durations[i]), T0 + i * 1000);
    }
    const { entry } = await engine.answer(cards[5].id, 'production', ok(1500), T0 + DAY);
    expect(entry.rating).toBe(4);
  });

  test('a wrong answer is Again and puts the card in (re)learning', async () => {
    const [card] = await addCloze('{{Reality}}');
    const { entry, state } = await engine.answer(card.id, 'recognition', wrong, T0);
    expect(entry.rating).toBe(1);
    expect([State.Learning, State.Relearning]).toContain(state.state);
  });

  test('cardState replays the log to the state returned by the last answer', async () => {
    const [card] = await addCloze('{{Reality}}');
    await engine.answer(card.id, 'recognition', ok(), T0);
    await engine.answer(card.id, 'recognition', wrong, T0 + DAY);
    const last = await engine.answer(card.id, 'recognition', ok(), T0 + 2 * DAY);
    expect(await engine.cardState(card.id)).toEqual(last.state);
  });

  test('correcting a past answer rewrites its grade and recomputes the state from the log', async () => {
    const [card] = await addCloze('{{Reality}}');
    await engine.answer(card.id, 'production', ok(), T0);
    const last = await engine.answer(card.id, 'production', ok(), T0 + DAY);
    const state = await engine.correctLast(last.entry.id, false, T0 + DAY);
    const log = await repo.listReviews(card.id);
    expect(log[1]).toMatchObject({ id: last.entry.id, rating: 1, correct: false });
    expect(state).toEqual(makeScheduler(DEFAULT_SETTINGS).replay(T0, log));
    expect(state).not.toEqual(last.state);
  });

  test('marking a wrong answer as right gives it the rating of a correct answer in its mode', async () => {
    const [card] = await addCloze('{{Reality}}');
    const { entry } = await engine.answer(card.id, 'recognition', wrong, T0);
    await engine.correctLast(entry.id, true, T0);
    expect((await repo.listReviews(card.id))[0]).toMatchObject({ rating: 2, correct: true });
  });

  test('a self outcome is rejected outside self mode, and an auto outcome inside it', async () => {
    const [card] = await addCloze('{{Reality}}');
    await expect(engine.answer(card.id, 'recognition', { kind: 'self', grade: 3 }, T0)).rejects.toThrow('mode');
    await expect(engine.answer(card.id, 'self', ok(), T0)).rejects.toThrow('mode');
    expect(await repo.listReviews(card.id)).toEqual([]);
  });

  test('only the latest answer of a card can be corrected', async () => {
    const [card] = await addCloze('{{Reality}}');
    const first = await engine.answer(card.id, 'production', ok(), T0);
    const second = await engine.answer(card.id, 'production', ok(), T0 + DAY);
    const before = await engine.cardState(card.id);
    await expect(engine.correctLast(first.entry.id, false, T0 + DAY)).rejects.toThrow('latest');
    const after = await engine.correctLast(second.entry.id, false, T0 + DAY);
    expect(after).not.toEqual(before);
  });

  test('answering an unknown card is rejected', async () => {
    await expect(engine.answer('missing', 'recognition', ok(), T0)).rejects.toThrow('missing');
  });
});

describe('sure of the answer', () => {
  test('an answer marked sure is recorded as such, and keeps it when corrected', async () => {
    const { createDexieRepo } = await import('../../src/storage/dexie-repo');
    const { createEngine } = await import('../../src/core/engine');
    const { newId } = await import('../../src/core/ids');
    const repo = createDexieRepo(`sure-${newId()}`);
    await repo.putTheme({ id: 't', name: 'T', order: 0 });
    const [card] = await repo.putNote({ id: 'n', themeId: 't', fields: { type: 'cloze', text: '{{a}}' }, tags: [], createdAt: 0, updatedAt: 0 });
    const engine = createEngine(repo, 'd');
    const { entry } = await engine.answer(card.id, 'production', { kind: 'auto', correct: false, durationMs: 2000, hintUsed: false, confident: true }, 1000);
    expect(entry.confident).toBe(true);
    await engine.correctLast(entry.id, true, 2000);
    expect((await repo.listReviews(card.id))[0].confident).toBe(true);
    const plain = await engine.answer(card.id, 'production', { kind: 'auto', correct: true, durationMs: 2000, hintUsed: false }, 3000);
    expect(plain.entry).not.toHaveProperty('confident');
  });
});
