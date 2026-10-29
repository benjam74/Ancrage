<script lang="ts">
  import { browserStorage } from '../app/cloud';
  import { checkPin, loadRegistry, setCurrent, type Profile } from '../app/profiles';
  import { FACE, markChosen } from './faces';

  let { current, onkeep }: { current: string; onkeep: () => void } = $props();

  const store = browserStorage();
  const profiles = loadRegistry(store).profiles;
  let asking = $state<Profile | null>(null);
  let pin = $state('');
  let error = $state('');

  function open(p: Profile) {
    if (p.pin && !asking) {
      asking = p;
      pin = '';
      error = '';
      return;
    }
    if (!checkPin(p, pin)) {
      error = 'Ce n’est pas le bon code.';
      pin = '';
      return;
    }
    markChosen();
    if (p.id === current) return onkeep();
    setCurrent(store, p.id);
    location.reload();
  }
</script>

<main class="who">
  <h1>{asking ? asking.name : 'Qui révise ?'}</h1>
  {#if asking}
    <form class="actions" style="justify-content:center" onsubmit={(e) => { e.preventDefault(); open(asking!); }}>
      <label class="sr" for="pin">Code à 4 chiffres</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input id="pin" class="inline-input pin-input" inputmode="numeric" maxlength="4" autocomplete="off" autofocus bind:value={pin} />
      <button class="btn" disabled={pin.length !== 4}>Ouvrir</button>
      <button type="button" class="btn ghost" onclick={() => (asking = null)}>Retour</button>
    </form>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <p class="muted">Le code évite d’ouvrir le profil de quelqu’un d’autre par erreur.</p>
  {:else}
    <div class="who-list">
      {#each profiles as p (p.id)}
        <button class="who-btn" onclick={() => open(p)}>
          <span class="face" style="--pc:{FACE[p.color]}" aria-hidden="true">{p.name.charAt(0).toUpperCase()}</span>
          {p.name}
          {#if p.pin}<span class="muted" style="font-size:12px">avec code</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</main>
