<script lang="ts">
  import { tick } from 'svelte';
  import { BUILTIN_SYNC } from '../app/builtin';
  import { setPassword } from '../sync/supabase';

  /** Opened from the « new password » e-mail: the link carries a short-lived token. */
  let { token, onclose }: { token: string; onclose: () => void } = $props();

  let password = $state('');
  let again = $state('');
  let busy = $state(false);
  let done = $state(false);
  let message = $state('');
  let error = $state('');

  async function submit() {
    if (busy || !BUILTIN_SYNC) return;
    error = '';
    if (password.length < 6) return void (error = 'Le mot de passe doit faire au moins 6 caractères.');
    if (password !== again) return void (error = 'Les deux mots de passe sont différents.');
    busy = true;
    try {
      const res = await setPassword(BUILTIN_SYNC, token, password);
      if (!res.ok) return void (error = res.error);
      done = true;
      message = 'Mot de passe changé. Utilise-le pour te connecter sur tes appareils.';
      await tick();
      document.getElementById('np-continue')?.focus();
    } finally {
      busy = false;
    }
  }
</script>

<main class="who welcome">
  <h1>Nouveau mot de passe</h1>
  <p role="status">{message}</p>
  {#if done}
    <button id="np-continue" class="btn" onclick={onclose}>Continuer</button>
  {:else}
    <form class="form welcome-form" onsubmit={(e) => { e.preventDefault(); void submit(); }} novalidate>
      <div class="field">
        <label for="np-1">Nouveau mot de passe</label>
        <input id="np-1" type="password" bind:value={password} autocomplete="new-password" aria-describedby="np-hint" />
        <span id="np-hint" class="hint">6 caractères minimum.</span>
      </div>
      <div class="field">
        <label for="np-2">Confirme le mot de passe</label>
        <input id="np-2" type="password" bind:value={again} autocomplete="new-password" />
      </div>
      <button class="btn" disabled={busy}>{busy ? 'Un instant…' : 'Enregistrer'}</button>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </form>
    <button class="btn ghost" onclick={onclose}>Annuler</button>
  {/if}
</main>
