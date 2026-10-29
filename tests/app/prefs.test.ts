import { describe, expect, test } from 'vitest';
import { memoryStorage } from '../../src/app/cloud';
import { DEFAULT_PREFS, loadPrefs, savePrefs } from '../../src/app/prefs';

describe('device preferences', () => {
  test('defaults when nothing is stored', () => {
    expect(loadPrefs(memoryStorage())).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS).toEqual({ sound: true, haptics: true, motion: true, showStreak: true, dailyRounds: 1, plan: null, goal: null, lastChapter: null, domain: null });
  });

  test('round trip', () => {
    const store = memoryStorage();
    const p = { ...DEFAULT_PREFS, sound: false, dailyRounds: 2 as const, plan: { time: '07:45', cue: 'après le café' } };
    savePrefs(store, p);
    expect(loadPrefs(store)).toEqual(p);
  });

  test('corrupted or invalid values fall back to defaults', () => {
    const store = memoryStorage();
    store.set('ancrage.prefs', '{broken');
    expect(loadPrefs(store)).toEqual(DEFAULT_PREFS);
    store.set('ancrage.prefs', JSON.stringify({ sound: 'yes', dailyRounds: 7, plan: { time: '25:99', cue: 'x' }, haptics: false }));
    expect(loadPrefs(store)).toEqual({ ...DEFAULT_PREFS, haptics: false });
    store.set('ancrage.prefs', 'null');
    expect(loadPrefs(store)).toEqual(DEFAULT_PREFS);
  });
});
