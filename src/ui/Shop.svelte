<script lang="ts">
  import type { Services, ShopState } from '../app/services';
  import type { CharacterId, Slot } from '../core/model';
  import { CHARACTERS, CHARACTER_NAMES, NAME_MAX, SLOTS, resale } from '../core/shop';
  import { CATALOG, type Item, type Tier } from '../data/items';
  import Avatar from './Avatar.svelte';
  import { prefs, updatePrefs } from './prefs.svelte';

  let { services, shop, onchange }: { services: Services; shop: ShopState; onchange: () => Promise<void> } = $props();

  const SLOT_LABEL: Record<Slot, string> = {
    haut: 'Hauts', bas: 'Bas', chapeau: 'Chapeaux', lunettes: 'Lunettes', cou: 'Cou', objet: 'Objets', compagnon: 'Compagnons', decor: 'Décors',
  };
  const TIER_LABEL: Record<Tier, string> = { commun: 'Commun', rare: 'Rare', epique: 'Épique', legendaire: 'Légendaire' };

  let picking = $state(false);
  let character = $state<CharacterId>('renard');
  let name = $state('');
  let tab = $state<Slot>('haut');
  /** Item tried on without buying it. */
  let trying = $state<Item | null>(null);
  let confirming = $state<string | null>(null);
  let busy = $state(false);
  let message = $state('');

  const choosing = $derived(!shop.chosen || picking);
  const preview = $derived(trying ? { ...shop.outfit, [trying.slot]: trying.id } : shop.outfit);
  const items = $derived(CATALOG.filter((i) => i.slot === tab));
  const fr = (n: number) => n.toLocaleString('fr-FR');

  function startPicking() {
    character = shop.avatar.character;
    name = shop.chosen ? shop.avatar.name : '';
    picking = true;
  }

  async function act(action: () => Promise<string | void>) {
    if (busy) return;
    busy = true;
    message = '';
    try {
      message = (await action()) ?? '';
      await onchange();
    } finally {
      busy = false;
    }
  }

  const chooseCharacter = () =>
    act(async () => {
      await services.setAvatar(character, name, Date.now());
      picking = false;
    });

  const buy = (item: Item) =>
    act(async () => {
      const res = await services.buy(item.id, Date.now());
      confirming = null;
      if (!res.ok) return res.error;
      trying = null;
      if (prefs.goal === item.id) updatePrefs({ goal: null });
      return `${item.name} : acheté et porté.`;
    });

  const sell = (item: Item) =>
    act(async () => {
      const res = await services.sell(item.id, Date.now());
      confirming = null;
      return res.ok ? `${item.name} revendu : +${res.refund} XP.` : res.error;
    });

  const wear = (item: Item, on: boolean) => act(() => services.equip(item.slot, on ? item.id : null, Date.now()));
</script>

<main class="page wide shop">
  <header class="row">
    <div>
      <p class="eyebrow">Boutique</p>
      <h1>{choosing ? 'Choisis ton personnage' : shop.avatar.name}</h1>
    </div>
    {#if !choosing}
      <div class="wallet" aria-live="polite">
        <span class="wallet-n">{fr(shop.balance)} XP</span>
        <span class="muted">à dépenser · {fr(shop.earned)} XP gagnés depuis le début</span>
      </div>
    {/if}
  </header>

  {#if choosing}
    <section class="panel" aria-labelledby="pick-title">
      <h2 id="pick-title" class="sr">Personnage</h2>
      <p class="muted">Tout le monde commence en pyjama. Les vêtements et objets que tu achètes iront à n’importe lequel des quatre, et tu pourras changer quand tu veux.</p>
      <div class="chars" role="radiogroup" aria-label="Personnage">
        {#each CHARACTERS as c (c)}
          <label class="char" class:on={character === c}>
            <input type="radio" name="character" value={c} checked={character === c} onchange={() => (character = c)} />
            <Avatar character={c} pose={character === c ? 'jump' : 'idle'} />
            <span>{CHARACTER_NAMES[c]}</span>
          </label>
        {/each}
      </div>
      <div class="field">
        <label for="char-name">Son nom</label>
        <input id="char-name" bind:value={name} maxlength={NAME_MAX} placeholder={CHARACTER_NAMES[character]} />
      </div>
      <div class="actions">
        <button class="btn sun" disabled={busy} onclick={chooseCharacter}>{shop.chosen ? 'Valider' : 'C’est parti'}</button>
        {#if shop.chosen}<button class="btn ghost" onclick={() => (picking = false)}>Annuler</button>{/if}
      </div>
    </section>
  {:else}
    <div class="shop-grid">
      <aside class="stage" aria-label="Aperçu">
        <div class="stage-frame">
          <Avatar character={shop.avatar.character} outfit={preview} decor label="{shop.avatar.name}{trying ? `, essaie ${trying.name}` : ''}" />
        </div>
        {#if trying}
          <p class="muted">Essayage : {trying.name}. Rien n’est acheté.</p>
          <button class="btn small ghost" onclick={() => (trying = null)}>Retirer l’essayage</button>
        {/if}
        <button class="btn small ghost" onclick={startPicking}>Changer de personnage</button>
        <p role="status" class="muted">{message}</p>
      </aside>

      <section class="panel" aria-labelledby="shop-items">
        <h2 id="shop-items" class="sr">Objets</h2>
        <div class="tabs shop-tabs" role="group" aria-label="Catégorie">
          {#each SLOTS as s (s)}
            <button aria-pressed={tab === s} onclick={() => { tab = s; confirming = null; }}>{SLOT_LABEL[s]}</button>
          {/each}
        </div>
        <ul class="items">
          {#each items as item (item.id)}
            {@const has = shop.owned.has(item.id)}
            {@const worn = shop.outfit[item.slot] === item.id}
            <li class="item tier-{item.tier}" class:worn>
              <button class="item-look" aria-label="Essayer {item.name}" onclick={() => (trying = has ? null : item)}>
                <Avatar character={shop.avatar.character} outfit={{ ...shop.outfit, [item.slot]: item.id }} decor={item.slot === 'decor'} pose="idle" />
              </button>
              <div class="item-info">
                <span class="item-name">{item.name}</span>
                <span class="tier">{TIER_LABEL[item.tier]}</span>
                {#if worn}<span class="pill">Porté</span>{:else if has}<span class="pill">Possédé</span>{:else}<span class="price">{fr(item.price)} XP</span>{/if}
              </div>
              <div class="item-actions">
                {#if confirming === item.id && !has}
                  <span class="confirm-q">Acheter pour {fr(item.price)} XP ?</span>
                  <button class="btn small" disabled={busy} onclick={() => buy(item)}>Oui</button>
                  <button class="btn small ghost" onclick={() => (confirming = null)}>Non</button>
                {:else if confirming === item.id && has}
                  <span class="confirm-q">Revendre pour {fr(resale(item.price))} XP ?</span>
                  <button class="btn small danger" disabled={busy} onclick={() => sell(item)}>Oui</button>
                  <button class="btn small ghost" onclick={() => (confirming = null)}>Non</button>
                {:else if has}
                  <button class="btn small" disabled={busy} onclick={() => wear(item, !worn)}>{worn ? 'Retirer' : 'Porter'}</button>
                  <button class="btn small ghost" onclick={() => (confirming = item.id)}>Revendre</button>
                {:else}
                  <button class="btn small" disabled={busy || shop.balance < item.price} onclick={() => (confirming = item.id)}>Acheter</button>
                  {#if prefs.goal === item.id}
                    <span class="pill goal">Objectif</span>
                  {:else}
                    <button class="btn small ghost" onclick={() => updatePrefs({ goal: item.id })}>En faire mon objectif</button>
                  {/if}
                  {#if shop.balance < item.price}<span class="muted short-by">Encore {fr(item.price - Math.max(0, shop.balance))} XP</span>{/if}
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      </section>
    </div>
  {/if}
</main>
