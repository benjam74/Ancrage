import 'fake-indexeddb/auto';
import { describe, expect, test } from 'vitest';
import { validateSettings } from '../../src/core/settings';
import { createServices, seedIfEmpty } from '../../src/app/services';
import { createDexieRepo } from '../../src/storage/dexie-repo';
import { newId } from '../../src/core/ids';
import { DEFAULT_SETTINGS } from '../../src/core/model';

const NOW = new Date(2026, 9, 28, 10, 0).getTime();

describe('validateSettings', () => {
  test('accepts a decimal comma or point', () => {
    expect(validateSettings({ desiredRetention: '0,9', newPerDay: '5' })).toEqual({ ok: true, settings: { desiredRetention: 0.9, newPerDay: 5 } });
    expect(validateSettings({ desiredRetention: 0.85, newPerDay: 0 })).toEqual({ ok: true, settings: { desiredRetention: 0.85, newPerDay: 0 } });
  });

  test.each(['0.5', '1', 'abc', '', '0,98'])('rejects retention %s', (value) => {
    const res = validateSettings({ desiredRetention: value, newPerDay: '5' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.desiredRetention).toMatch(/entre 0,70 et 0,97/);
  });

  test.each(['12.5', '-1', '51', 'x'])('rejects new cards per day %s', (value) => {
    const res = validateSettings({ desiredRetention: '0.9', newPerDay: value });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.newPerDay).toMatch(/entier entre 0 et 50/);
  });
});

describe('updateSettings', () => {
  test('an invalid input keeps the stored settings', async () => {
    const services = createServices(createDexieRepo(`settings-${newId()}`), 'd');
    const res = await services.updateSettings({ desiredRetention: '1', newPerDay: '5' });
    expect(res.ok).toBe(false);
    expect(await services.repo.getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  test('a valid input is stored and applies to the daily queue', async () => {
    const services = createServices(createDexieRepo(`settings-${newId()}`), 'd');
    await seedIfEmpty(services.repo, NOW);
    expect((await services.updateSettings({ desiredRetention: '0,92', newPerDay: '2' })).ok).toBe(true);
    expect(await services.repo.getSettings()).toEqual({ desiredRetention: 0.92, newPerDay: 2 });
    expect((await services.today(NOW)).fresh).toBe(2);
  });
});
