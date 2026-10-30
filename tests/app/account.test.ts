import { describe, expect, test } from 'vitest';
import { memoryStorage } from '../../src/app/cloud';
import { builtinConfig } from '../../src/app/builtin';
import { PULL_FIRST, WELCOME_DONE, openElsewhere, applyMeta, attachAccount, metaFrom, profileForAccount, seedFor, settled, signInAccount, signUpAccount, welcomeNeeded } from '../../src/app/account';
import { MAIN, loadRegistry, scopedStorage } from '../../src/app/profiles';
import { isAuthFragment, linkNotice, recoverPassword, recoveryToken, setPassword, signIn, signUp } from '../../src/sync/supabase';
import { fakeSupabase } from '../sync/fake-supabase';

const session = (email: string, meta?: Record<string, unknown>) => ({ accessToken: 'a', refreshToken: 'r', expiresAt: 1, email, ...(meta ? { meta } : {}) });

describe('built-in project', () => {
  test('read from the deploy variables; missing or malformed gives none', () => {
    expect(builtinConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co/', VITE_SUPABASE_ANON_KEY: ' k ' })).toEqual({ url: 'https://x.supabase.co', anonKey: 'k' });
    expect(builtinConfig({})).toBeNull();
    expect(builtinConfig({ VITE_SUPABASE_URL: 'http://x', VITE_SUPABASE_ANON_KEY: 'k' })).toBeNull();
  });
});

describe('accounts and profiles', () => {
  test('an account remembers who it is for, and gives it back at sign-in', async () => {
    const srv = fakeSupabase();
    const config = { url: 'https://projet.supabase.co', anonKey: 'anon-key' };
    const up = await signUp(config, 'lea@ex.fr', 'secret12', srv.fetchFn, srv.now, { name: 'Léa', audience: 'élève de 5e', starter: 'college5', color: 'coral' });
    expect(up.ok && metaFrom(up.session.meta)).toEqual({ name: 'Léa', audience: 'élève de 5e', starter: 'college5', color: 'coral' });
    expect(metaFrom({ name: '', starter: 'x' })).toBeNull();
  });
  test('signing in on a fresh device sets up the profile and fetches data first', () => {
    const store = memoryStorage();
    const meta = metaFrom({ name: 'Léa', audience: 'élève de 5e', starter: 'college5', color: 'coral' })!;
    expect(applyMeta(store, MAIN, meta)).toMatchObject({ name: 'Léa', starter: 'college5' });
    attachAccount(store, MAIN, session('lea@ex.fr'), true);
    expect(store.get(PULL_FIRST)).toBe('1');
    expect(JSON.parse(store.get('ancrage.sync.session')!).email).toBe('lea@ex.fr');
  });
  test('a profile added for an existing account gets its name, its session, and no duplicate', () => {
    const store = memoryStorage();
    const res = profileForAccount(store, session('lea@ex.fr', { name: 'Léa', audience: 'élève de 5e', starter: 'college5', color: 'coral' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(loadRegistry(store).profiles.map((p) => p.name)).toEqual(['Principal', 'Léa']);
    const scoped = scopedStorage(store, res.profile.id);
    expect(scoped.get(PULL_FIRST)).toBe('1');
    expect(profileForAccount(store, session('lea@ex.fr'))).toMatchObject({ ok: false });
    const other = profileForAccount(store, session('lea2@ex.fr', { name: 'Léa', audience: '', starter: 'none', color: 'sun' }));
    expect(other.ok && other.profile.name).toBe('Léa 2');
  });
});

describe('welcome page', () => {
  const config = { url: 'https://projet.supabase.co', anonKey: 'anon-key' };
  const lea = { name: 'Léa', audience: 'élève de 5e', starter: 'college5' as const, color: 'coral' as const };

  test('shown only on a new device with a built-in project, never again once answered', () => {
    const store = memoryStorage();
    expect(welcomeNeeded(store, config, false)).toBe(true);
    expect(welcomeNeeded(store, null, false)).toBe(false);
    // A device that already has its cards (users from before accounts) never sees it.
    expect(welcomeNeeded(store, config, true)).toBe(false);
    store.set(WELCOME_DONE, '1');
    expect(welcomeNeeded(store, config, false)).toBe(false);
    const signedIn = memoryStorage();
    attachAccount(signedIn, MAIN, session('a@b.fr'), false);
    expect(welcomeNeeded(signedIn, config, false)).toBe(false);
  });

  test('creating an account names the profile, keeps the setup with the account, seeds the examples', async () => {
    const srv = fakeSupabase();
    const store = memoryStorage();
    const res = await signUpAccount(store, MAIN, config, 'lea@ex.fr', 'secret12', lea, srv.fetchFn, srv.now);
    expect(res).toEqual({ ok: true });
    expect(loadRegistry(store).profiles[0]).toMatchObject({ name: 'Léa', starter: 'college5', audience: 'élève de 5e' });
    expect(store.get(WELCOME_DONE)).toBe('1');
    expect(seedFor(store, loadRegistry(store).profiles[0])).toBe('college5');
    const back = await signInAccount(memoryStorage(), MAIN, config, 'lea@ex.fr', 'secret12', srv.fetchFn, srv.now);
    expect(back.ok).toBe(true);
  });

  test('an account waiting for e-mail confirmation says so and changes nothing yet', async () => {
    const srv = fakeSupabase({ confirmEmail: true });
    const store = memoryStorage();
    const res = await signUpAccount(store, MAIN, config, 'lea@ex.fr', 'secret12', lea, srv.fetchFn, srv.now);
    expect(res).toMatchObject({ ok: false, confirm: true });
    expect(store.get('ancrage.sync.session')).toBeNull();
    expect(store.get(WELCOME_DONE)).toBeNull();
  });

  test('signing in on a new device takes the account setup and fetches before seeding', async () => {
    const srv = fakeSupabase();
    await signUp(config, 'lea@ex.fr', 'secret12', srv.fetchFn, srv.now, lea);
    const store = memoryStorage();
    expect(await signInAccount(store, MAIN, config, 'lea@ex.fr', 'faux', srv.fetchFn, srv.now)).toMatchObject({ ok: false });
    expect(store.get(WELCOME_DONE)).toBeNull();
    expect(await signInAccount(store, MAIN, config, 'lea@ex.fr', 'secret12', srv.fetchFn, srv.now)).toEqual({ ok: true });
    const profile = loadRegistry(store).profiles[0];
    expect(profile).toMatchObject({ name: 'Léa', starter: 'college5' });
    // No examples while the account's cards are on their way.
    expect(seedFor(store, profile)).toBe('none');
    expect(settled(store, { state: 'error' })).toBe(false);
    expect(seedFor(store, profile)).toBe('none');
    expect(settled(store, { state: 'ok' })).toBe(true);
    expect(store.get(PULL_FIRST)).toBeNull();
    expect(settled(store, { state: 'ok' })).toBe(false);
  });

  test('an account created before accounts had a setup keeps the profile as it is', async () => {
    const srv = fakeSupabase();
    await signUp(config, 'old@ex.fr', 'secret12', srv.fetchFn, srv.now);
    const store = memoryStorage();
    expect(await signInAccount(store, MAIN, config, 'old@ex.fr', 'secret12', srv.fetchFn, srv.now)).toEqual({ ok: true });
    expect(loadRegistry(store).profiles[0].name).toBe('Principal');
  });
});

describe('forgotten password', () => {
  const config = { url: 'https://projet.supabase.co', anonKey: 'anon-key' };
  test('the link from the e-mail lets one choose a new password, then sign in with it', async () => {
    const srv = fakeSupabase();
    await signUp(config, 'lea@ex.fr', 'secret12', srv.fetchFn, srv.now);
    expect(await recoverPassword(config, 'lea@ex.fr', srv.fetchFn)).toEqual({ ok: true });
    const link = srv.recoveryLink('lea@ex.fr');
    expect(isAuthFragment(link)).toBe(true);
    expect(isAuthFragment('#reglages')).toBe(false);
    const token = recoveryToken(link)!;
    expect(recoveryToken('#access_token=x&type=signup')).toBeNull();
    expect(await setPassword(config, token, '123', srv.fetchFn)).toMatchObject({ ok: false });
    expect(await setPassword(config, token, 'nouveau1', srv.fetchFn)).toEqual({ ok: true });
    expect((await signIn(config, 'lea@ex.fr', 'nouveau1', srv.fetchFn, srv.now)).ok).toBe(true);
    srv.advance(7200);
    expect(await setPassword(config, token, 'encore12', srv.fetchFn)).toMatchObject({ ok: false, error: expect.stringContaining('expiré') });
  });
});

test('links from e-mails that fail or confirm an address say so', () => {
  expect(linkNotice('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')).toMatch(/expiré/);
  expect(linkNotice('#access_token=x&type=signup')).toMatch(/confirmée/);
  expect(linkNotice('#access_token=x&type=recovery')).toBeNull();
  expect(linkNotice('#reglages')).toBeNull();
});

test('an account already open in another profile of the device is not opened again', async () => {
  const srv = fakeSupabase();
  const config = { url: 'https://projet.supabase.co', anonKey: 'anon-key' };
  await signUp(config, 'papa@ex.fr', 'secret12', srv.fetchFn, srv.now);
  const store = memoryStorage();
  attachAccount(store, MAIN, session('Papa@ex.fr'), false);
  const added = profileForAccount(store, session('lea@ex.fr'));
  if (!added.ok) throw new Error(added.error);
  expect(openElsewhere(store, 'papa@ex.fr', MAIN)).toBeNull();
  const res = await signInAccount(store, added.profile.id, config, 'papa@ex.fr', 'secret12', srv.fetchFn, srv.now);
  expect(res).toMatchObject({ ok: false, error: expect.stringContaining('Principal') });
  expect(JSON.parse(scopedStorage(store, added.profile.id).get('ancrage.sync.session')!).email).toBe('lea@ex.fr');
});
