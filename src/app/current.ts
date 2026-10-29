import { browserStorage, type KeyValue } from './cloud';
import { loadRegistry, scopedStorage, type Profile } from './profiles';

/** The profile this page runs for. Switching profile reloads the page, so this is read once. */
const registry = loadRegistry(browserStorage());
export const currentProfile: Profile = registry.profiles.find((p) => p.id === registry.current)!;
export const profileCount = registry.profiles.length;

/** Device storage of the current profile (settings, sync, AI key). */
export function profileStore(): KeyValue {
  return scopedStorage(browserStorage(), currentProfile.id);
}
