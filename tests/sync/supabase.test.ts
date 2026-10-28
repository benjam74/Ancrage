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
    expect(await signIn(config, 'b@ex.fr', 'x', srv.fetchFn, srv.now)).toEqual({ ok: false, error: 'Impossible de joindre le serveur. Vérifie ta connexion et l’adresse du projet.' });
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
