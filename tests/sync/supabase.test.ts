import 'fake-indexeddb/auto';
import { describe, expect, test } from 'vitest';
import { createSupabaseRemote, signIn, signUp, type AuthSession } from '../../src/sync/supabase';
import { createCloudSync, memoryStorage } from '../../src/app/cloud';
import { createServices, seedIfEmpty } from '../../src/app/services';
import { createDexieRepo } from '../../src/storage/dexie-repo';
import { newId } from '../../src/core/ids';
import { DEFAULT_SETTINGS } from '../../src/core/model';
import type { Dump } from '../../src/core/backup';
import { fakeSupabase } from './fake-supabase';

const config = { url: 'https://projet.supabase.co', anonKey: 'anon-key' };
const empty: Dump = { themes: [], notes: [], cards: [], reviews: [], events: [], settings: { ...DEFAULT_SETTINGS }, flags: [], tombstones: [], settingsUpdatedAt: 0 };

describe('Supabase auth', () => {
  test('sign up then sign in', async () => {
    const srv = fakeSupabase();
    const up = await signUp(config, 'b@ex.fr', 'secret12', srv.fetchFn, srv.now);
    expect(up.ok).toBe(true);
    const res = await signIn(config, 'b@ex.fr', 'secret12', srv.fetchFn, srv.now);
    expect(res.ok && res.session.email).toBe('b@ex.fr');
  });

  test('wrong password gives a French message', async () => {
    const srv = fakeSupabase();
    await signUp(config, 'b@ex.fr', 'secret12', srv.fetchFn, srv.now);
    const res = await signIn(config, 'b@ex.fr', 'faux', srv.fetchFn, srv.now);
    expect(res).toEqual({ ok: false, error: 'E-mail ou mot de passe incorrect.' });
  });

  test('sign up with e-mail confirmation asks to confirm first', async () => {
    const srv = fakeSupabase({ confirmEmail: true });
    const res = await signUp(config, 'b@ex.fr', 'secret12', srv.fetchFn, srv.now);
    expect(res).toEqual({ ok: false, error: 'Compte créé. Confirme ton adresse avec le lien reçu par e-mail, puis connecte-toi.' });
    expect(await signIn(config, 'b@ex.fr', 'secret12', srv.fetchFn, srv.now)).toEqual({ ok: false, error: 'Adresse e-mail pas encore confirmée : ouvre le lien reçu par e-mail.' });
  });

  test('network down gives a French message', async () => {
    const srv = fakeSupabase();
    srv.setOffline(true);
    expect(await signIn(config, 'b@ex.fr', 'x', srv.fetchFn, srv.now)).toMatchObject({ ok: false, error: 'Impossible de joindre le serveur. Vérifie ta connexion, puis réessaie.' });
  });
});

describe('Supabase remote', () => {
  async function remoteFor(srv: ReturnType<typeof fakeSupabase>) {
    await signUp(config, 'b@ex.fr', 'secret12', srv.fetchFn, srv.now);
    const res = await signIn(config, 'b@ex.fr', 'secret12', srv.fetchFn, srv.now);
    if (!res.ok) throw new Error(res.error);
    let session: AuthSession | null = res.session;
    const remote = createSupabaseRemote(config, () => session, (s) => (session = s), srv.fetchFn, srv.now);
    return { remote, session: () => session! };
  }

  test('empty remote, first insert, then conditional update and stale-version conflict', async () => {
    const srv = fakeSupabase();
    const { remote } = await remoteFor(srv);
    expect(await remote.get()).toBeNull();
    expect(await remote.put(empty, null)).toEqual({ ok: true, version: 1 });
    expect(await remote.put(empty, null)).toEqual({ ok: false, conflict: true });
    expect(await remote.put(empty, 1)).toEqual({ ok: true, version: 2 });
    expect(await remote.put(empty, 1)).toEqual({ ok: false, conflict: true });
    expect((await remote.get())?.version).toBe(2);
  });

  test('sends apikey and bearer token', async () => {
    const srv = fakeSupabase();
    const { remote, session } = await remoteFor(srv);
    await remote.get();
    const last = srv.calls[srv.calls.length - 1];
    expect(last.headers.apikey).toBe('anon-key');
    expect(last.headers.authorization).toBe(`Bearer ${session().accessToken}`);
  });

  test('an expiring token is refreshed before the request', async () => {
    const srv = fakeSupabase();
    const { remote, session } = await remoteFor(srv);
    const first = session().accessToken;
    srv.advance(3590);
    await remote.get();
    expect(session().accessToken).not.toBe(first);
    expect(srv.calls.some((c) => c.path.includes('grant_type=refresh_token'))).toBe(true);
  });
});

describe('offline and expired tokens', () => {
  test('an expired token while offline keeps the session and says the network is down', async () => {
    const srv = fakeSupabase();
    await signUp(config, 'b@ex.fr', 'secret12', srv.fetchFn, srv.now);
    const res = await signIn(config, 'b@ex.fr', 'secret12', srv.fetchFn, srv.now);
    if (!res.ok) throw new Error(res.error);
    let session: AuthSession | null = res.session;
    const remote = createSupabaseRemote(config, () => session, (s) => (session = s), srv.fetchFn, srv.now);
    srv.advance(7200);
    srv.setOffline(true);
    await expect(remote.get()).rejects.toThrow(/joindre le serveur/);
    expect(session).not.toBeNull();
    srv.setOffline(false);
    expect(await remote.get()).toBeNull();
  });

  test('a 401 from the table triggers one refresh, then the request succeeds', async () => {
    const srv = fakeSupabase();
    await signUp(config, 'b@ex.fr', 'secret12', srv.fetchFn, srv.now);
    const res = await signIn(config, 'b@ex.fr', 'secret12', srv.fetchFn, srv.now);
    if (!res.ok) throw new Error(res.error);
    // The device clock believes the token is fresh, the server says it expired.
    let session: AuthSession | null = { ...res.session, expiresAt: Number.MAX_SAFE_INTEGER };
    const remote = createSupabaseRemote(config, () => session, (s) => (session = s), srv.fetchFn, srv.now);
    srv.advance(7200);
    expect(await remote.get()).toBeNull();
    expect(session).not.toBeNull();
  });

  test('a missing table gives a setup hint', async () => {
    const srv = fakeSupabase({ noTable: true });
    await signUp(config, 'b@ex.fr', 'secret12', srv.fetchFn, srv.now);
    const res = await signIn(config, 'b@ex.fr', 'secret12', srv.fetchFn, srv.now);
    if (!res.ok) throw new Error(res.error);
    const session: AuthSession | null = res.session;
    const remote = createSupabaseRemote(config, () => session, () => {}, srv.fetchFn, srv.now);
    await expect(remote.get()).rejects.toThrow(/table ancrage_snapshots/);
  });

  test('writes ask only for the version back, not the whole snapshot', async () => {
    const srv = fakeSupabase();
    await signUp(config, 'b@ex.fr', 'secret12', srv.fetchFn, srv.now);
    const res = await signIn(config, 'b@ex.fr', 'secret12', srv.fetchFn, srv.now);
    if (!res.ok) throw new Error(res.error);
    const session: AuthSession | null = res.session;
    const remote = createSupabaseRemote(config, () => session, () => {}, srv.fetchFn, srv.now);
    await remote.put(empty, null);
    await remote.put(empty, 1);
    const writes = srv.calls.filter((c) => c.method !== 'GET' && c.path.startsWith('/rest/'));
    expect(writes.every((c) => c.path.includes('select=version'))).toBe(true);
  });
});

describe('cloud sync service', () => {
  test('two devices sync through Supabase and converge', async () => {
    const srv = fakeSupabase();
    const NOW = new Date(2026, 9, 28, 10, 0).getTime();
    const a = createServices(createDexieRepo(`cloud-a-${newId()}`), 'a');
    const b = createServices(createDexieRepo(`cloud-b-${newId()}`), 'b');
    await seedIfEmpty(a.repo, NOW);
    const cloudA = createCloudSync(a.repo, memoryStorage(), srv.fetchFn, srv.now);
    const cloudB = createCloudSync(b.repo, memoryStorage(), srv.fetchFn, srv.now);
    expect(cloudA.configure(config)).toEqual({ ok: true });
    cloudB.configure(config);
    expect((await cloudA.signUp('b@ex.fr', 'secret12')).ok).toBe(true);
    expect((await cloudB.signIn('b@ex.fr', 'secret12')).ok).toBe(true);
    expect((await cloudA.sync()).state).toBe('ok');
    expect((await cloudB.sync()).state).toBe('ok');
    expect(await b.repo.dumpAll()).toEqual(await a.repo.dumpAll());
  });

  test('not configured or signed out reports off; offline reports an error and keeps data', async () => {
    const srv = fakeSupabase();
    const a = createServices(createDexieRepo(`cloud-off-${newId()}`), 'a');
    const cloud = createCloudSync(a.repo, memoryStorage(), srv.fetchFn, srv.now);
    expect((await cloud.sync()).state).toBe('off');
    expect(cloud.configure({ url: 'http://pas-https', anonKey: 'x' })).toEqual({ ok: false, error: 'L’adresse du projet doit commencer par https://.' });
    cloud.configure(config);
    await cloud.signUp('b@ex.fr', 'secret12');
    srv.setOffline(true);
    const before = await a.repo.dumpAll();
    const res = await cloud.sync();
    expect(res.state).toBe('error');
    expect(res.message).toMatch(/joindre le serveur/);
    expect(await a.repo.dumpAll()).toEqual(before);
    cloud.signOut();
    expect((await cloud.sync()).state).toBe('off');
  });
});

describe('fast sync through the items table', () => {
  test('without the table, the app keeps the whole copy and says so; with it, only changes travel', async () => {
    const srv = fakeSupabase();
    const repo = createDexieRepo(`fast-${newId()}`);
    await seedIfEmpty(repo, 1000);
    const cloud = createCloudSync(repo, memoryStorage(), srv.fetchFn, srv.now);
    cloud.configure(config);
    await cloud.signUp('f@ex.fr', 'secret12');
    expect(await cloud.sync()).toMatchObject({ state: 'ok', mode: 'full' });

    srv.enableItems();
    expect(await cloud.sync()).toMatchObject({ state: 'ok', mode: 'fast' });
    const sentFirst = srv.itemWrites();
    expect(sentFirst).toBeGreaterThan(20);
    expect(await cloud.sync()).toMatchObject({ mode: 'fast' });
    expect(srv.itemWrites()).toBe(sentFirst);

    // A second device on the same account receives everything through the items.
    const repo2 = createDexieRepo(`fast2-${newId()}`);
    const cloud2 = createCloudSync(repo2, memoryStorage(), srv.fetchFn, srv.now);
    cloud2.configure(config);
    await cloud2.signIn('f@ex.fr', 'secret12');
    expect(await cloud2.sync()).toMatchObject({ state: 'ok', mode: 'fast' });
    expect((await repo2.listNotes()).length).toBe((await repo.listNotes()).length);
  });
});
