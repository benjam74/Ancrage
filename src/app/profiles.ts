import { newId } from '../core/ids';
import type { KeyValue } from './cloud';

/** Family profiles on one device: each has its own database and its own device settings (like Anki profiles). */

export type ProfileColor = 'petrol' | 'coral' | 'sun' | 'ok' | 'violet';
export type Starter = 'coaching' | 'college5' | 'none';

export interface Profile {
  id: string;
  name: string;
  color: ProfileColor;
  /** Who the cards are for, e.g. « élève de 5e »: phrases the AI generation. */
  audience: string;
  /** Optional 4-digit code: avoids opening someone else's profile by mistake; not a security measure. */
  pin: string | null;
  /** Example cards seeded on first opening. */
  starter: Starter;
}

export interface Registry {
  profiles: Profile[];
  current: string;
}

export const MAIN = 'principal';
export const COLORS: ProfileColor[] = ['petrol', 'coral', 'sun', 'ok', 'violet'];
const KEY = 'ancrage.profiles';
const NAME_MAX = 20;

export const DEFAULT_REGISTRY: Registry = {
  profiles: [{ id: MAIN, name: 'Principal', color: 'petrol', audience: 'adulte qui se forme au coaching et à la PNL', pin: null, starter: 'coaching' }],
  current: MAIN,
};

const fresh = (): Registry => structuredClone(DEFAULT_REGISTRY);

function validProfile(p: unknown): p is Profile {
  if (!p || typeof p !== 'object') return false;
  const r = p as Record<string, unknown>;
  return (
    typeof r.id === 'string' && typeof r.name === 'string' && r.name.trim().length > 0 &&
    COLORS.includes(r.color as ProfileColor) && typeof r.audience === 'string' &&
    (r.pin === null || (typeof r.pin === 'string' && /^\d{4}$/.test(r.pin))) &&
    ['coaching', 'college5', 'none'].includes(r.starter as string)
  );
}

export function loadRegistry(store: KeyValue): Registry {
  try {
    const raw = JSON.parse(store.get(KEY) ?? 'null');
    if (!raw || !Array.isArray(raw.profiles) || !raw.profiles.every(validProfile) || !raw.profiles.some((p: Profile) => p.id === MAIN)) return fresh();
    const current = raw.profiles.some((p: Profile) => p.id === raw.current) ? raw.current : MAIN;
    return { profiles: raw.profiles, current };
  } catch {
    return fresh();
  }
}

export function saveRegistry(store: KeyValue, r: Registry): void {
  store.set(KEY, JSON.stringify(r));
}

/** The main profile keeps the database it always had; the others get their own. */
export const dbName = (id: string) => (id === MAIN ? 'ancrage' : `ancrage-${id}`);

/** Device keys of a profile: unchanged for the main one, prefixed for the others. */
export function scopedStorage(store: KeyValue, id: string): KeyValue {
  if (id === MAIN) return store;
  const key = (k: string) => k.replace(/^ancrage\./, `ancrage.p.${id}.`);
  return { get: (k) => store.get(key(k)), set: (k, v) => store.set(key(k), v), remove: (k) => store.remove(key(k)) };
}

type Input = Omit<Profile, 'id'>;
type Result = { ok: true; profile: Profile } | { ok: false; error: string };

function check(r: Registry, input: Partial<Input>, selfId: string | null): string | null {
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return 'Donne un prénom au profil.';
    if (r.profiles.some((p) => p.id !== selfId && p.name.toLowerCase() === name.slice(0, NAME_MAX).toLowerCase())) return 'Un profil porte déjà ce nom.';
  }
  if (input.pin !== undefined && input.pin !== null && !/^\d{4}$/.test(input.pin)) return 'Le code doit faire exactement 4 chiffres.';
  return null;
}

export function createProfile(store: KeyValue, input: Input): Result {
  const r = loadRegistry(store);
  const error = check(r, input, null) ?? (input.name.trim().toLowerCase() === MAIN ? 'Un profil porte déjà ce nom.' : null);
  if (error) return { ok: false, error };
  const profile: Profile = { ...input, id: newId(), name: input.name.trim().slice(0, NAME_MAX), audience: input.audience.trim() };
  saveRegistry(store, { ...r, profiles: [...r.profiles, profile] });
  return { ok: true, profile };
}

export function updateProfile(store: KeyValue, id: string, patch: Partial<Input>): Result {
  const r = loadRegistry(store);
  const current = r.profiles.find((p) => p.id === id);
  if (!current) return { ok: false, error: 'Ce profil n’existe plus.' };
  const error = check(r, patch, id);
  if (error) return { ok: false, error };
  const profile = { ...current, ...patch, ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, NAME_MAX) } : {}) };
  saveRegistry(store, { ...r, profiles: r.profiles.map((p) => (p.id === id ? profile : p)) });
  return { ok: true, profile };
}

export function removeProfile(store: KeyValue, id: string): { ok: true } | { ok: false; error: string } {
  const r = loadRegistry(store);
  if (id === r.current) return { ok: false, error: 'Change de profil avant de supprimer celui-ci.' };
  if (id === MAIN) return { ok: false, error: 'Le profil principal ne peut pas être supprimé.' };
  saveRegistry(store, { ...r, profiles: r.profiles.filter((p) => p.id !== id) });
  return { ok: true };
}

export function setCurrent(store: KeyValue, id: string): void {
  const r = loadRegistry(store);
  if (r.profiles.some((p) => p.id === id)) saveRegistry(store, { ...r, current: id });
}

export const checkPin = (p: Profile, pin: string) => p.pin === null || p.pin === pin;
