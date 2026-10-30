import type { SyncConfig } from '../sync/supabase';

/**
 * The Supabase project built into this copy of the app (deploy variables VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY): nobody has to type an address or a key. The key is public by design.
 */
export function builtinConfig(env: Record<string, string | undefined>): SyncConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  return url && anonKey && /^https:\/\/[^\s/]+/.test(url) ? { url, anonKey } : null;
}

export const BUILTIN_SYNC = builtinConfig(import.meta.env as Record<string, string | undefined>);
