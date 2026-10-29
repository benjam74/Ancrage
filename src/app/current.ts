import { browserStorage, type KeyValue } from './cloud';
import { loadRegistry, scopedStorage, type Profile } from './profiles';

/**
 * The profile this tab runs for. Each tab remembers its own choice (sessionStorage), so picking a profile
 * in one tab never switches another; the registry's `current` is only the default. Read once: switching reloads.
 */
const TAB_KEY = 'ancrage.tabProfile';

function tabChoice(): string | null {
  try { return sessionStorage.getItem(TAB_KEY); } catch { return null; }
}

const registry = loadRegistry(browserStorage());
const chosen = tabChoice();
export const currentProfile: Profile = registry.profiles.find((p) => p.id === (chosen ?? registry.current)) ?? registry.profiles[0];
export const profileCount = registry.profiles.length;
/** Coaching wording (examples, scenario cards) only for the profiles that learn coaching. */
export const coachingProfile = currentProfile.starter === 'coaching';
export const EXAMPLES = coachingProfile
  ? { theme: 'Ex. Écoute active', source: 'Ex. Formation PNL, module 2', text: 'Colle ici tes notes de formation, un extrait de livre, une transcription…' }
  : { theme: 'Ex. Les fractions', source: 'Ex. Cours du 12 mars', text: 'Colle ici ton cours, une leçon, un extrait de livre…' };
/** With several profiles, a tab that has not chosen yet asks « Qui révise ? » (always, if sessionStorage is unavailable). */
export const mustChoose = profileCount > 1 && !registry.profiles.some((p) => p.id === chosen);

export function markChosen(id: string): void {
  try { sessionStorage.setItem(TAB_KEY, id); } catch { /* the picker shows again on the next load: safe */ }
}
export function forgetChoice(): void {
  try { sessionStorage.removeItem(TAB_KEY); } catch { /* nothing to forget */ }
}

/** Device storage of the current profile (settings, sync, AI key). */
export function profileStore(): KeyValue {
  return scopedStorage(browserStorage(), currentProfile.id);
}
