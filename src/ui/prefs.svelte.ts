import { loadPrefs, savePrefs, type Prefs } from '../app/prefs';

import { profileStore } from '../app/current';

const store = profileStore();

/** Device preferences shared by every screen; changes are saved at once. */
export const prefs: Prefs = $state(loadPrefs(store));

export function updatePrefs(patch: Partial<Prefs>): void {
  Object.assign(prefs, patch);
  savePrefs(store, $state.snapshot(prefs));
}

/** Animations run only when the preference allows them and the system does not ask for less motion. */
export function motionOn(): boolean {
  try {
    return prefs.motion && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return prefs.motion;
  }
}
