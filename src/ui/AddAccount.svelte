<script lang="ts">
  import { profileForAccount } from '../app/account';
  import { BUILTIN_SYNC } from '../app/builtin';
  import { browserStorage } from '../app/cloud';
  import { markChosen } from '../app/current';
  import { setCurrent } from '../app/profiles';
  import { signIn } from '../sync/supabase';

  /** Someone else's account on this device: a new profile, filled from the account, then opened. */
  let { onback }: { onback: () => void } = $props();

  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state('');

  async function submit() {
    if (busy || !BUILTIN_SYNC) return;
    busy = true;
    error = '';
    try {
      const res = await signIn(BUILTIN_SYNC, email.trim(), password);
      if (!res.ok) return void (error = res.error);
      const store = browserStorage();
      const added = profileForAccount(store, res.session);
      if (!added.ok) return void (error = added.error);
      markChosen(added.profile.id);
      setCurrent(store, added.profile.id);
      location.hash = 'accueil';
      location.reload();
    } finally {
      busy = false;
    }
  }
</script>

<form class="form welcome-form" onsubmit={(e) => { e.preventDefault(); void submit(); }} novalidate>
  <div class="field">
    <label for="acc-email">E-mail du compte</label>
    <input id="acc-email" type="email" bind:value={email} autocomplete="username" />
  </div>
  <div class="field">
    <label for="acc-password">Mot de passe du compte</label>
    <input id="acc-password" type="password" bind:value={password} autocomplete="current-password" />
  </div>
  <div class="actions">
    <button class="btn" disabled={busy || !email.trim() || !password}>{busy ? 'Un instant…' : 'Ouvrir ce compte'}</button>
    <button type="button" class="btn ghost" onclick={onback}>Retour</button>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</form>
