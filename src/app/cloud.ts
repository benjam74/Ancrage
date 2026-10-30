import type { Repo } from '../storage/repo';
import { createSupabaseItems, createSupabaseRemote, signIn, signUp, type AuthSession, type SyncConfig } from '../sync/supabase';
import { repoSyncState, syncItems, syncOnce } from '../sync/sync';
import { ItemsMissing } from '../sync/items-remote';
import { BUILTIN_SYNC } from './builtin';

export interface KeyValue {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface SyncStatus {
  state: 'off' | 'ok' | 'error';
  at?: number;
  message?: string;
  /** `fast`: only changes travel (table ancrage_items) · `full`: the whole copy each time. */
  mode?: 'fast' | 'full';
}

export interface CloudSync {
  config(): SyncConfig | null;
  email(): string | null;
  last(): SyncStatus;
  configure(config: SyncConfig): { ok: true } | { ok: false; error: string };
  signIn(email: string, password: string): Promise<{ ok: boolean; error?: string }>;
  /** `meta`: kept with the account (first name, who it is for), to set up the next devices. */
  signUp(email: string, password: string, meta?: Record<string, unknown>): Promise<{ ok: boolean; error?: string }>;
  signOut(): void;
  /** Never throws: errors come back as a status, local data stays as it was. */
  sync(): Promise<SyncStatus>;
}

const CONFIG_KEY = 'ancrage.sync.config';
const SESSION_KEY = 'ancrage.sync.session';
const STATUS_KEY = 'ancrage.sync.status';

/** localStorage when available; it can throw (private mode, blocked storage). */
export function browserStorage(): KeyValue {
  return {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* best effort */ } },
    remove: (k) => { try { localStorage.removeItem(k); } catch { /* best effort */ } },
  };
}

export function memoryStorage(): KeyValue {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
}

export function createCloudSync(repo: Repo, store: KeyValue, fetchFn: typeof fetch = fetch, now: () => number = Date.now, builtin: SyncConfig | null = BUILTIN_SYNC): CloudSync {
  const read = <T>(key: string): T | null => {
    try {
      const raw = store.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  };
  const session = () => read<AuthSession>(SESSION_KEY);
  const saveSession = (s: AuthSession | null) => (s ? store.set(SESSION_KEY, JSON.stringify(s)) : store.remove(SESSION_KEY));
  const record = (s: SyncStatus) => {
    store.set(STATUS_KEY, JSON.stringify(s));
    return s;
  };
  let running: Promise<SyncStatus> | null = null;

  const self: CloudSync = {
    // A project built into the app (see docs/sync-supabase.md) unless this device chose another one.
    config: () => read<SyncConfig>(CONFIG_KEY) ?? builtin,
    email: () => session()?.email ?? null,
    last: () => read<SyncStatus>(STATUS_KEY) ?? { state: 'off' },

    configure(config) {
      const url = config.url.trim().replace(/\/+$/, '');
      const anonKey = config.anonKey.trim();
      if (!/^https:\/\/[^\s/]+/.test(url)) return { ok: false, error: 'L’adresse du projet doit commencer par https://.' };
      if (!anonKey) return { ok: false, error: 'La clé publique (anon) est obligatoire.' };
      store.set(CONFIG_KEY, JSON.stringify({ url, anonKey }));
      return { ok: true };
    },

    async signIn(email, password) {
      const config = self.config();
      if (!config) return { ok: false, error: 'Renseigne d’abord l’adresse et la clé du projet.' };
      const res = await signIn(config, email.trim(), password, fetchFn, now);
      if (!res.ok) return res;
      saveSession(res.session);
      return { ok: true };
    },

    async signUp(email, password, meta = {}) {
      const config = self.config();
      if (!config) return { ok: false, error: 'Renseigne d’abord l’adresse et la clé du projet.' };
      const res = await signUp(config, email.trim(), password, fetchFn, now, meta);
      if (!res.ok) return res;
      saveSession(res.session);
      return { ok: true };
    },

    signOut() {
      saveSession(null);
      store.remove(STATUS_KEY);
    },

    sync() {
      // One sync at a time: a second call waits for the running one.
      running ??= (async () => {
        const config = self.config();
        if (!config || !session()) return { state: 'off' } as SyncStatus;
        try {
          const snapshot = createSupabaseRemote(config, session, saveSession, fetchFn, now);
          try {
            // The sync state belongs to one account on one project.
            await syncItems(repo, createSupabaseItems(config, session, saveSession, fetchFn, now), repoSyncState(repo, `${config.url}|${session()?.email ?? ''}`), snapshot, now);
            return record({ state: 'ok', at: now(), mode: 'fast' });
          } catch (e) {
            if (!(e instanceof ItemsMissing)) throw e;
          }
          await syncOnce(repo, snapshot);
          return record({ state: 'ok', at: now(), mode: 'full' });
        } catch (e) {
          return record({ state: 'error', at: now(), message: (e as Error).message });
        }
      })().finally(() => (running = null));
      return running;
    },
  };
  return self;
}
