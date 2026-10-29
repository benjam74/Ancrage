import { describe, expect, test } from 'vitest';
import { memoryStorage } from '../../src/app/cloud';
import { DEFAULT_REGISTRY, checkPin, createProfile, dbName, loadRegistry, removeProfile, scopedStorage, setCurrent, updateProfile } from '../../src/app/profiles';

describe('profile registry', () => {
  test('defaults to the main profile, which keeps the existing database and keys', () => {
    const store = memoryStorage();
    expect(loadRegistry(store)).toEqual(DEFAULT_REGISTRY);
    expect(DEFAULT_REGISTRY.current).toBe('principal');
    expect(dbName('principal')).toBe('ancrage');
    const main = scopedStorage(store, 'principal');
    main.set('ancrage.prefs', 'x');
    expect(store.get('ancrage.prefs')).toBe('x');
  });

  test('a new profile gets its own database and prefixed keys', () => {
    const store = memoryStorage();
    const res = createProfile(store, { name: '  Léa  ', color: 'coral', audience: 'élève de 5e', pin: '1234', starter: 'college5' });
    if (!res.ok) throw new Error(res.error);
    expect(res.profile).toMatchObject({ name: 'Léa', color: 'coral', audience: 'élève de 5e', pin: '1234', starter: 'college5' });
    expect(dbName(res.profile.id)).toBe(`ancrage-${res.profile.id}`);
    const lea = scopedStorage(store, res.profile.id);
    lea.set('ancrage.prefs', 'y');
    expect(store.get(`ancrage.p.${res.profile.id}.prefs`)).toBe('y');
    expect(store.get('ancrage.prefs')).toBeNull();
    expect(lea.get('ancrage.prefs')).toBe('y');
    expect(loadRegistry(store).profiles.map((p) => p.name)).toEqual(['Principal', 'Léa']);
  });

  test('names are 1 to 20 characters and unique, codes are exactly 4 digits', () => {
    const store = memoryStorage();
    const base = { color: 'petrol' as const, audience: '', pin: null, starter: 'none' as const };
    expect(createProfile(store, { ...base, name: '   ' }).ok).toBe(false);
    expect(createProfile(store, { ...base, name: 'principal' }).ok).toBe(false);
    expect(createProfile(store, { ...base, name: 'Tom', pin: '12a4' }).ok).toBe(false);
    expect(createProfile(store, { ...base, name: 'Tom', pin: '123' }).ok).toBe(false);
    const ok = createProfile(store, { ...base, name: 'Un prénom vraiment beaucoup trop long' });
    expect(ok.ok && ok.profile.name).toBe('Un prénom vraiment b');
  });

  test('switching, updating, removing (never the current one)', () => {
    const store = memoryStorage();
    const res = createProfile(store, { name: 'Tom', color: 'sun', audience: '', pin: null, starter: 'none' });
    if (!res.ok) throw new Error(res.error);
    setCurrent(store, res.profile.id);
    expect(loadRegistry(store).current).toBe(res.profile.id);
    expect(removeProfile(store, res.profile.id, res.profile.id).ok).toBe(false);
    expect(updateProfile(store, 'principal', { name: 'Papa' }).ok).toBe(true);
    expect(loadRegistry(store).profiles[0].name).toBe('Papa');
    setCurrent(store, 'principal');
    expect(removeProfile(store, res.profile.id, 'principal').ok).toBe(true);
    expect(loadRegistry(store).profiles).toHaveLength(1);
  });

  test('a corrupted registry falls back to the main profile', () => {
    const store = memoryStorage();
    store.set('ancrage.profiles', '{nope');
    expect(loadRegistry(store)).toEqual(DEFAULT_REGISTRY);
    store.set('ancrage.profiles', JSON.stringify({ profiles: [{ id: 'x' }], current: 'x' }));
    expect(loadRegistry(store)).toEqual(DEFAULT_REGISTRY);
  });

  test('one damaged entry does not hide the other profiles', () => {
    const store = memoryStorage();
    const lea = { id: 'lea', name: 'Léa', color: 'coral', audience: '', pin: null, starter: 'none' };
    store.set('ancrage.profiles', JSON.stringify({ profiles: [{ id: 'broken' }, lea, lea], current: 'lea' }));
    expect(loadRegistry(store)).toEqual({ profiles: [DEFAULT_REGISTRY.profiles[0], lea], current: 'lea' });
  });

  test('a profile without code always opens; with one, only the right code', () => {
    expect(checkPin({ ...DEFAULT_REGISTRY.profiles[0], pin: null }, '')).toBe(true);
    expect(checkPin({ ...DEFAULT_REGISTRY.profiles[0], pin: '1234' }, '1234')).toBe(true);
    expect(checkPin({ ...DEFAULT_REGISTRY.profiles[0], pin: '1234' }, '4321')).toBe(false);
  });
});
