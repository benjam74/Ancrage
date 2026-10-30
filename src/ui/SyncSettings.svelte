<script lang="ts">
  import { untrack } from 'svelte';
  import type { CloudSync, SyncStatus } from '../app/cloud';
  import { howLongAgo } from './format';
  import { BUILTIN_SYNC } from '../app/builtin';
  import { settled } from '../app/account';
  import { currentProfile, profileStore } from '../app/current';

  let { cloud, onsynced }: { cloud: CloudSync; onsynced: () => void } = $props();

  // The cloud service is created once at boot; read its stored values once.
  const initial = untrack(() => ({ config: cloud.config(), email: cloud.email(), last: cloud.last() }));
  let url = $state(initial.config?.url ?? '');
  let anonKey = $state(initial.config?.anonKey ?? '');
  let email = $state(initial.email ?? '');
  let password = $state('');
  let signedIn = $state(!!initial.email);
  let status = $state<SyncStatus>(initial.last);
  let message = $state('');
  let error = $state('');
  let busy = $state(false);
  // Same project as the app's own: no address or key to type.
  const builtin = !!BUILTIN_SYNC && initial.config?.url === BUILTIN_SYNC.url;

  const ago = (at?: number) => (at ? howLongAgo(at, Date.now()) : '');

  async function run(action: () => Promise<void>) {
    if (busy) return;
    busy = true;
    error = '';
    message = '';
    try {
      await action();
    } finally {
      busy = false;
    }
  }

  const connect = (mode: 'in' | 'up') =>
    run(async () => {
      // The project built into the app needs no address; another one is kept on this device.
      if (!builtin) {
        const conf = cloud.configure({ url, anonKey });
        if (!conf.ok) return void (error = conf.error);
      }
      // The account keeps who it is for, to set up the next devices the same way.
      const meta = { name: currentProfile.name, audience: currentProfile.audience, starter: currentProfile.starter, color: currentProfile.color };
      const res = mode === 'in' ? await cloud.signIn(email, password) : await cloud.signUp(email, password, meta);
      if (!res.ok) {
        // Creating an account that needs e-mail confirmation is a success, not an error.
        if (res.error?.startsWith('Compte créé')) return void (message = res.error);
        return void (error = res.error ?? 'Connexion impossible.');
      }
      password = '';
      signedIn = true;
      await syncNow();
    });

  async function syncNow() {
    status = await cloud.sync();
    settled(profileStore(), status);
    signedIn = !!cloud.email();
    if (status.state === 'ok') {
      message = 'Synchronisé.';
      onsynced();
    } else if (status.state === 'error') error = status.message ?? 'La synchronisation a échoué.';
  }

  function signOut() {
    cloud.signOut();
    signedIn = false;
    status = { state: 'off' };
    message = 'Déconnecté. Tes données restent sur cet appareil.';
  }
</script>

<section class="panel" aria-labelledby="sync-title">
  <h2 id="sync-title">Synchronisation</h2>
  {#if builtin}
    <p>Connecte-toi à ton compte Ancrage pour retrouver tes cartes sur ton ordinateur et ton téléphone.</p>
  {:else}
    <p>Utilise Ancrage sur ton ordinateur et ton téléphone avec un projet Supabase gratuit, à toi. La mise en place prend dix minutes : <a href="https://github.com/benjam74/Ancrage/blob/main/docs/sync-supabase.md" target="_blank" rel="noopener">guide de synchronisation</a>.</p>
  {/if}

  {#if signedIn}
    <p><b>Connecté : {email}</b></p>
    <p class="muted">
      {status.state === 'ok' ? `Dernière synchronisation ${ago(status.at)}.` : status.state === 'error' ? `Échec ${ago(status.at)} : ${status.message}` : 'Pas encore synchronisé.'}
      La synchronisation se fait à l’ouverture et après chaque manche.
    </p>
    {#if status.state === 'ok' && status.mode === 'fast'}
      <p class="muted">Synchronisation rapide : seuls les changements voyagent.</p>
    {:else if status.state === 'ok' && status.mode === 'full' && !builtin}
      <p class="notice">Synchronisation complète : toute ta base voyage à chaque fois. Pour n’envoyer que les changements, exécute une fois le script « Synchronisation rapide » du <a href="https://github.com/benjam74/Ancrage/blob/main/docs/sync-supabase.md#synchronisation-rapide" target="_blank" rel="noopener">guide</a> dans ton projet Supabase.</p>
    {/if}
    <div class="actions">
      <button class="btn" disabled={busy} onclick={() => run(syncNow)}>Synchroniser maintenant</button>
      <button class="btn ghost" disabled={busy} onclick={signOut}>Se déconnecter</button>
    </div>
  {:else}
    <form class="form" onsubmit={(e) => { e.preventDefault(); connect('in'); }} novalidate>
      {#if !builtin}
        <div class="field">
          <label for="sync-url">Adresse du projet</label>
          <input id="sync-url" bind:value={url} placeholder="https://xxxx.supabase.co" autocomplete="off" inputmode="url" />
        </div>
        <div class="field">
          <label for="sync-key">Clé publique (anon)</label>
          <input id="sync-key" bind:value={anonKey} autocomplete="off" />
        </div>
      {/if}
      <div class="row2">
        <div class="field">
          <label for="sync-email">E-mail</label>
          <input id="sync-email" type="email" bind:value={email} autocomplete="username" />
        </div>
        <div class="field">
          <label for="sync-password">Mot de passe</label>
          <input id="sync-password" type="password" bind:value={password} autocomplete="current-password" />
        </div>
      </div>
      <div class="actions">
        <button class="btn" disabled={busy}>Se connecter</button>
        <button type="button" class="btn ghost" disabled={busy} onclick={() => connect('up')}>Créer le compte</button>
      </div>
    </form>
  {/if}
  <p role="status" class="muted">{message}</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>
