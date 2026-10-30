<script lang="ts">
  import { ACCOUNT_KINDS, WELCOME_DONE, signInAccount, signUpAccount } from '../app/account';
  import { BUILTIN_SYNC } from '../app/builtin';
  import { browserStorage } from '../app/cloud';
  import { currentProfile, profileStore } from '../app/current';
  import { recoverPassword } from '../sync/supabase';

  let { ondone }: { ondone: () => void } = $props();

  type Mode = 'in' | 'up' | 'forgot';
  let mode = $state<Mode>('in');
  let email = $state('');
  let password = $state('');
  let name = $state(currentProfile.name === 'Principal' ? '' : currentProfile.name);
  let kind = $state<keyof typeof ACCOUNT_KINDS>(currentProfile.starter === 'college5' ? 'college5' : currentProfile.starter === 'none' ? 'autre' : 'coaching');
  let busy = $state(false);
  let error = $state('');
  let message = $state('');

  const config = BUILTIN_SYNC!;

  function switchTo(next: Mode) {
    mode = next;
    error = '';
    message = '';
  }

  async function submit() {
    if (busy) return;
    error = '';
    message = '';
    if (!email.trim()) return void (error = 'Indique ton adresse e-mail.');
    if (mode === 'in' && !password) return void (error = 'Indique ton mot de passe.');
    if (mode === 'up' && password.length < 6) return void (error = 'Le mot de passe doit faire au moins 6 caractères.');
    if (mode === 'up' && !name.trim()) return void (error = 'Indique ton prénom.');
    busy = true;
    try {
      if (mode === 'forgot') {
        const res = await recoverPassword(config, email.trim());
        if (res.ok) message = 'Si un compte existe pour cette adresse, un e-mail vient de partir avec un lien pour choisir un nouveau mot de passe.';
        else error = res.error;
        return;
      }
      const store = browserStorage();
      const k = ACCOUNT_KINDS[kind];
      const res =
        mode === 'in'
          ? await signInAccount(store, currentProfile.id, config, email, password)
          : await signUpAccount(store, currentProfile.id, config, email, password, { name: name.trim().slice(0, 20), audience: k.audience, starter: k.starter, color: currentProfile.color });
      if (res.ok) {
        // The profile's name and examples come from the account: start again with them.
        location.reload();
        return;
      }
      if ('confirm' in res && res.confirm) {
        message = res.error;
        password = '';
        mode = 'in';
      } else error = res.error;
    } finally {
      busy = false;
    }
  }

  function skip() {
    profileStore().set(WELCOME_DONE, '1');
    ondone();
  }
</script>

<main class="who welcome">
  <div>
    <h1>Ancrage</h1>
    <p class="muted">Retiens ce que tu apprends, quelques minutes par jour.</p>
  </div>

  {#if mode !== 'forgot'}
    <div class="tabs" role="group" aria-label="Compte">
      <button aria-pressed={mode === 'in'} onclick={() => switchTo('in')}>J’ai un compte</button>
      <button aria-pressed={mode === 'up'} onclick={() => switchTo('up')}>Créer un compte</button>
    </div>
  {/if}

  <form class="form welcome-form" onsubmit={(e) => { e.preventDefault(); void submit(); }} novalidate>
    {#if mode === 'forgot'}
      <h2>Mot de passe oublié</h2>
      <p class="muted">Tu recevras un lien pour en choisir un nouveau.</p>
    {/if}
    {#if mode === 'up'}
      <div class="field">
        <label for="w-name">Prénom</label>
        <input id="w-name" bind:value={name} maxlength="20" autocomplete="given-name" />
      </div>
      <fieldset class="field">
        <legend>Pour réviser quoi ?</legend>
        {#each Object.entries(ACCOUNT_KINDS) as [id, k] (id)}
          <label class="check"><input type="radio" name="w-kind" value={id} bind:group={kind} /> {k.label}</label>
        {/each}
      </fieldset>
    {/if}
    <div class="field">
      <label for="w-email">E-mail</label>
      <input id="w-email" type="email" bind:value={email} autocomplete="username" inputmode="email" />
    </div>
    {#if mode !== 'forgot'}
      <div class="field">
        <label for="w-password">Mot de passe</label>
        <input id="w-password" type="password" bind:value={password} autocomplete={mode === 'up' ? 'new-password' : 'current-password'} />
      </div>
    {/if}
    <button class="btn" disabled={busy}>{busy ? 'Un instant…' : mode === 'in' ? 'Se connecter' : mode === 'up' ? 'Créer mon compte' : 'Envoyer le lien'}</button>
    {#if mode === 'in'}
      <button type="button" class="btn ghost small" onclick={() => switchTo('forgot')}>Mot de passe oublié ?</button>
    {:else if mode === 'forgot'}
      <button type="button" class="btn ghost small" onclick={() => switchTo('in')}>Retour</button>
    {/if}
    <p role="status" class="muted">{message}</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </form>

  <div>
    <button class="btn ghost" onclick={skip}>Continuer sans compte</button>
    <p class="muted small-note">Sans compte, tes cartes restent sur cet appareil. Tu pourras te connecter plus tard dans Réglages.</p>
  </div>
</main>
