<script lang="ts">
  import { profileForAccount } from '../app/account';
  import { BUILTIN_SYNC } from '../app/builtin';
  import { browserStorage } from '../app/cloud';
  import { markChosen } from '../app/current';
  import { setCurrent } from '../app/profiles';
  import { recoverPassword, signIn } from '../sync/supabase';

  /** Someone else's account on this device: a new profile, filled from the account, then opened. */
  let { onback }: { onback: () => void } = $props();

  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state('');
  let message = $state('');

  async function submit() {
    if (busy || !BUILTIN_SYNC) return;
    error = '';
    message = '';
    if (!email.trim()) return void (error = 'Indique l’adresse e-mail du compte.');
    if (!password) return void (error = 'Indique le mot de passe du compte.');
    busy = true;
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

  async function forgot() {
    if (busy || !BUILTIN_SYNC) return;
    error = '';
    message = '';
    if (!email.trim()) return void (error = 'Indique d’abord l’adresse e-mail du compte.');
    busy = true;
    try {
      const res = await recoverPassword(BUILTIN_SYNC, email.trim());
      if (res.ok) message = 'Si un compte existe pour cette adresse, un e-mail vient de partir avec un lien pour choisir un nouveau mot de passe.';
      else error = res.error;
    } finally {
      busy = false;
    }
  }
</script>

<form class="form welcome-form" onsubmit={(e) => { e.preventDefault(); void submit(); }} novalidate>
  <h2>Ouvrir un compte existant</h2>
  <p class="muted">Un nouveau profil est créé sur cet appareil avec les cartes de ce compte.</p>
  <div class="field">
    <label for="acc-email">E-mail du compte</label>
    <input id="acc-email" type="email" bind:value={email} autocomplete="username" />
  </div>
  <div class="field">
    <label for="acc-password">Mot de passe du compte</label>
    <input id="acc-password" type="password" bind:value={password} autocomplete="current-password" />
  </div>
  <div class="actions">
    <button class="btn" disabled={busy}>{busy ? 'Un instant…' : 'Ouvrir ce compte'}</button>
    <button type="button" class="btn ghost" onclick={onback}>Retour</button>
  </div>
  <button type="button" class="link" onclick={forgot}>Mot de passe oublié ?</button>
  <p role="status" class="muted">{message}</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</form>
