import type { KeyValue, SyncStatus } from './cloud';
import { COLORS, createProfile, loadRegistry, scopedStorage, updateProfile, type Profile, type ProfileColor, type Starter } from './profiles';
import { signIn, signUp, type AuthSession, type SyncConfig } from '../sync/supabase';

/** What an account keeps about its owner, to set up each new device the same way. */
export interface AccountMeta {
  name: string;
  audience: string;
  starter: Starter;
  color: ProfileColor;
}

/** « Pour qui ? » when creating an account. */
export const ACCOUNT_KINDS = {
  coaching: { label: 'Coaching et PNL', audience: 'adulte qui se forme au coaching et à la PNL', starter: 'coaching' as Starter },
  college5: { label: 'Collège, 5e', audience: 'élève de 5e', starter: 'college5' as Starter },
  autre: { label: 'Autre chose', audience: '', starter: 'none' as Starter },
};

const SESSION_KEY = 'ancrage.sync.session';
/** The next opening fetches the account's data before anything is created locally (no example cards). */
export const PULL_FIRST = 'ancrage.account.pullFirst';
/** The welcome page was answered on this device. */
export const WELCOME_DONE = 'ancrage.welcomeDone';

export function metaFrom(raw: Record<string, unknown> | undefined): AccountMeta | null {
  if (!raw) return null;
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 20) : '';
  const starter = ['coaching', 'college5', 'none'].includes(raw.starter as string) ? (raw.starter as Starter) : null;
  if (!name || !starter) return null;
  return {
    name,
    audience: typeof raw.audience === 'string' ? raw.audience.trim().slice(0, 80) : '',
    starter,
    color: COLORS.includes(raw.color as ProfileColor) ? (raw.color as ProfileColor) : 'petrol',
  };
}

/** Links a profile of this device to an account: its session, and (for an existing account) data first. */
export function attachAccount(store: KeyValue, profileId: string, session: AuthSession, pullFirst: boolean): void {
  const scoped = scopedStorage(store, profileId);
  scoped.set(SESSION_KEY, JSON.stringify(session));
  if (pullFirst) scoped.set(PULL_FIRST, '1');
}

/** Gives a profile the account's first name and setup, keeping its own if the name is taken here. */
export function applyMeta(store: KeyValue, profileId: string, meta: AccountMeta): Profile | null {
  const res = updateProfile(store, profileId, { name: meta.name, audience: meta.audience, starter: meta.starter, color: meta.color });
  if (res.ok) return res.profile;
  const kept = updateProfile(store, profileId, { audience: meta.audience, starter: meta.starter, color: meta.color });
  return kept.ok ? kept.profile : null;
}

/**
 * Two profiles on one account would share and reschedule each other's cards: the account opens in one profile only.
 * Returns the message to show, or null when the account is not open in another profile of this device.
 */
export function openElsewhere(store: KeyValue, email: string, profileId: string | null): string | null {
  const wanted = email.trim().toLowerCase();
  const other = loadRegistry(store).profiles.find((p) => {
    if (p.id === profileId) return false;
    const s = scopedStorage(store, p.id).get(SESSION_KEY);
    try {
      return s ? (JSON.parse(s) as AuthSession).email.toLowerCase() === wanted : false;
    } catch {
      return false;
    }
  });
  return other ? `Ce compte est déjà ouvert ici, dans le profil « ${other.name} ».` : null;
}

/** A new profile on this device for an existing account (« Qui révise ? » → « Se connecter avec un compte »). */
export function profileForAccount(store: KeyValue, session: AuthSession): { ok: true; profile: Profile } | { ok: false; error: string } {
  const meta = metaFrom(session.meta);
  const already = openElsewhere(store, session.email, null);
  if (already) return { ok: false, error: already };
  const base = meta?.name || session.email.split('@')[0].slice(0, 20) || 'Profil';
  const names = new Set(loadRegistry(store).profiles.map((p) => p.name.toLowerCase()));
  let name = base;
  for (let i = 2; names.has(name.toLowerCase()); i++) name = `${base.slice(0, 17)} ${i}`;
  const res = createProfile(store, { name, audience: meta?.audience ?? '', starter: meta?.starter ?? 'none', color: meta?.color ?? 'coral', pin: null });
  if (!res.ok) return res;
  attachAccount(store, res.profile.id, session, true);
  return res;
}

/** First launch of a new device, with a project built into the app: offer to sign in before anything else. */
export function welcomeNeeded(scoped: KeyValue, builtin: SyncConfig | null, seeded: boolean): boolean {
  return !!builtin && !seeded && !scoped.get(WELCOME_DONE) && !scoped.get(SESSION_KEY);
}

/** Example cards to put in a new database: none while an existing account's cards are on their way. */
export function seedFor(scoped: KeyValue, profile: Profile): Starter {
  return scoped.get(PULL_FIRST) ? 'none' : profile.starter;
}

/**
 * After a sync: once the account's data has arrived, the device behaves as usual.
 * True for the first sync of a signed-in account (its cards are here now, or it has none: then examples may go in).
 */
export function settled(scoped: KeyValue, status: Pick<SyncStatus, 'state'>): boolean {
  if (status.state !== 'ok' || !scoped.get(PULL_FIRST)) return false;
  scoped.remove(PULL_FIRST);
  return true;
}

type Fetch = typeof fetch;

export async function signInAccount(store: KeyValue, profileId: string, config: SyncConfig, email: string, password: string, fetchFn: Fetch = fetch, now: () => number = Date.now): Promise<{ ok: true } | { ok: false; error: string }> {
  const already = openElsewhere(store, email, profileId);
  if (already) return { ok: false, error: already };
  const res = await signIn(config, email.trim(), password, fetchFn, now);
  if (!res.ok) return { ok: false, error: res.error };
  const meta = metaFrom(res.session.meta);
  if (meta) applyMeta(store, profileId, meta);
  attachAccount(store, profileId, res.session, true);
  scopedStorage(store, profileId).set(WELCOME_DONE, '1');
  return { ok: true };
}

/** `confirm`: the project asks to confirm the e-mail first; sign in afterwards. */
export async function signUpAccount(store: KeyValue, profileId: string, config: SyncConfig, email: string, password: string, meta: AccountMeta, fetchFn: Fetch = fetch, now: () => number = Date.now): Promise<{ ok: true } | { ok: false; error: string; confirm?: boolean }> {
  const res = await signUp(config, email.trim(), password, fetchFn, now, { ...meta });
  if (!res.ok) return res.error.startsWith('Compte créé') ? { ok: false, error: res.error, confirm: true } : { ok: false, error: res.error };
  applyMeta(store, profileId, meta);
  attachAccount(store, profileId, res.session, false);
  scopedStorage(store, profileId).set(WELCOME_DONE, '1');
  return { ok: true };
}
