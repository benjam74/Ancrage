<script lang="ts">
  import { browserStorage } from '../app/cloud';
  import { COLORS, MAIN, createProfile, dbName, loadRegistry, removeProfile, setCurrent, updateProfile, type Profile, type ProfileColor, type Starter } from '../app/profiles';
  import { COLOR_LABEL, FACE, forgetChoice, markChosen } from './faces';

  let { current }: { current: string } = $props();
  const store = browserStorage();

  let profiles = $state<Profile[]>(loadRegistry(store).profiles);
  let creating = $state(false);
  let editing = $state<string | null>(null);
  let deleting = $state<string | null>(null);
  let confirmName = $state('');
  let message = $state('');
  let error = $state('');

  let name = $state('');
  let audience = $state('');
  let color = $state<ProfileColor>('coral');
  let starter = $state<Starter>('college5');
  let pin = $state('');

  const reload = () => (profiles = loadRegistry(store).profiles);

  function startEdit(p: Profile) {
    editing = p.id;
    name = p.name;
    audience = p.audience;
    color = p.color;
    pin = p.pin ?? '';
    error = '';
  }

  function create(e: SubmitEvent) {
    e.preventDefault();
    const res = createProfile(store, { name, audience, color, starter, pin: pin.trim() || null });
    if (!res.ok) return void (error = res.error);
    error = '';
    message = `Profil « ${res.profile.name} » créé.`;
    creating = false;
    name = audience = pin = '';
    reload();
  }

  function save(e: SubmitEvent, id: string) {
    e.preventDefault();
    const res = updateProfile(store, id, { name, audience, color, pin: pin.trim() || null });
    if (!res.ok) return void (error = res.error);
    error = '';
    editing = null;
    message = 'Profil enregistré.';
    reload();
    if (id === current) location.reload();
  }

  function open(id: string) {
    markChosen();
    setCurrent(store, id);
    location.reload();
  }

  function remove(p: Profile) {
    const res = removeProfile(store, p.id);
    if (!res.ok) return void (error = res.error);
    // Its database and its device settings go with it.
    try {
      indexedDB.deleteDatabase(dbName(p.id));
      const prefix = `ancrage.p.${p.id}.`;
      for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.removeItem(key);
    } catch {
      // Storage unavailable: the registry no longer lists the profile anyway.
    }
    deleting = null;
    confirmName = '';
    message = `Profil « ${p.name} » supprimé.`;
    reload();
  }
</script>

<section class="panel" aria-labelledby="s-profiles" id="profils">
  <h2 id="s-profiles">Profils</h2>
  <p class="muted">Chaque profil a ses cartes, ses progrès, sa série, sa boutique et sa synchronisation. Idéal pour toute la famille sur un même appareil.</p>
  {#if message}<p class="notice" role="status">{message}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#each profiles as p (p.id)}
    <div class="profile-row">
      <span class="face small" style="--pc:{FACE[p.color]}" aria-hidden="true">{p.name.charAt(0).toUpperCase()}</span>
      {#if editing === p.id}
        <form class="form" style="grid-column: 2 / -1" onsubmit={(e) => save(e, p.id)}>
          <div class="row2">
            <div class="field"><label for="pe-name">Prénom</label><input id="pe-name" bind:value={name} maxlength="20" /></div>
            <div class="field"><label for="pe-aud">Pour qui ?</label><input id="pe-aud" bind:value={audience} placeholder="Ex. élève de 5e" /></div>
          </div>
          <div class="row2">
            <div class="field"><label for="pe-color">Couleur</label><select id="pe-color" bind:value={color}>{#each COLORS as c (c)}<option value={c}>{COLOR_LABEL[c]}</option>{/each}</select></div>
            <div class="field"><label for="pe-pin">Code (4 chiffres, facultatif)</label><input id="pe-pin" inputmode="numeric" maxlength="4" bind:value={pin} /></div>
          </div>
          <div class="actions"><button class="btn small">Enregistrer</button><button type="button" class="btn small ghost" onclick={() => (editing = null)}>Annuler</button></div>
        </form>
      {:else}
        <div>
          <b>{p.name}</b>{#if p.id === current} <span class="pill">Ouvert</span>{/if}
          <p class="muted" style="font-size:13px">{p.audience || 'Public non précisé'}{p.pin ? ' · avec code' : ''}</p>
        </div>
        <div class="actions">
          {#if p.id !== current}<button class="btn small" onclick={() => open(p.id)}>Ouvrir</button>{/if}
          <button class="btn small ghost" onclick={() => startEdit(p)}>Modifier</button>
          {#if p.id !== current && p.id !== MAIN}<button class="btn small ghost" onclick={() => { deleting = p.id; confirmName = ''; }}>Supprimer</button>{/if}
        </div>
        {#if deleting === p.id}
          <form class="actions" style="grid-column: 1 / -1" onsubmit={(e) => { e.preventDefault(); if (confirmName.trim() === p.name) remove(p); }}>
            <label for="pd-name" class="confirm">Toutes les cartes et les progrès de {p.name} seront effacés de cet appareil. Tape « {p.name} » pour confirmer.</label>
            <input id="pd-name" class="inline-input" style="width:auto" bind:value={confirmName} />
            <button class="btn small danger" disabled={confirmName.trim() !== p.name}>Supprimer définitivement</button>
            <button type="button" class="btn small ghost" onclick={() => (deleting = null)}>Annuler</button>
          </form>
        {/if}
      {/if}
    </div>
  {/each}

  {#if creating}
    <form class="form" onsubmit={create}>
      <div class="row2">
        <div class="field"><label for="pn-name">Prénom</label><input id="pn-name" bind:value={name} maxlength="20" placeholder="Ex. Léa" /></div>
        <div class="field"><label for="pn-aud">Pour qui ?</label><input id="pn-aud" bind:value={audience} placeholder="Ex. élève de 5e" /><span class="hint">Sert à adapter les cartes générées par l’IA.</span></div>
      </div>
      <div class="row2">
        <div class="field"><label for="pn-color">Couleur</label><select id="pn-color" bind:value={color}>{#each COLORS as c (c)}<option value={c}>{COLOR_LABEL[c]}</option>{/each}</select></div>
        <div class="field"><label for="pn-pin">Code (4 chiffres, facultatif)</label><input id="pn-pin" inputmode="numeric" maxlength="4" bind:value={pin} /><span class="hint">Évite d’ouvrir ce profil par erreur. Ce n’est pas un mot de passe.</span></div>
      </div>
      <fieldset class="field" style="border:0;padding:0;margin:0">
        <legend class="eyebrow">Cartes de départ</legend>
        <label class="check"><input type="radio" name="starter" value="college5" bind:group={starter} />Collège 5e (maths, français, histoire-géo, SVT, physique-chimie, anglais)</label>
        <label class="check"><input type="radio" name="starter" value="coaching" bind:group={starter} />Coaching et PNL</label>
        <label class="check"><input type="radio" name="starter" value="none" bind:group={starter} />Aucune : je crée mes propres cartes</label>
      </fieldset>
      <div class="actions"><button class="btn">Créer le profil</button><button type="button" class="btn ghost" onclick={() => (creating = false)}>Annuler</button></div>
    </form>
  {:else}
    <div class="actions">
      <button class="btn small" onclick={() => { creating = true; name = audience = pin = ''; color = 'coral'; starter = 'college5'; error = ''; }}>Ajouter un profil</button>
      {#if profiles.length > 1}<button class="btn small ghost" onclick={() => { forgetChoice(); location.reload(); }}>Changer de profil</button>{/if}
    </div>
  {/if}
</section>
