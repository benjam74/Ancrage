<script lang="ts">
  import type { Progress } from '../app/services';
  import { untrack } from 'svelte';
  import type { CustomChoice, CustomMode } from '../core/queue';
  import { domainOf } from '../core/domains';

  let { progress, preselect = null, onstart }: { progress: Progress; preselect?: string | null; onstart: (choice: CustomChoice) => void } = $props();

  const withCards = $derived(progress.themes.filter((t) => t.cards > 0));
  // Grouped by domain, in the domains' order; themes outside any domain last.
  const domainIds = $derived(new Set(progress.domains.map((d) => d.id)));
  const sections = $derived([
    ...progress.domains.map((d) => ({ id: d.id, name: d.name, themes: withCards.filter((t) => domainOf(t.theme, domainIds) === d.id) })),
    { id: '__loose', name: 'Sans domaine', themes: withCards.filter((t) => domainOf(t.theme, domainIds) === null) },
  ].filter((s) => s.themes.length));
  const allIn = (ids: string[]) => ids.every((id) => picked.includes(id));
  function toggleSection(ids: string[]) {
    picked = allIn(ids) ? picked.filter((x) => !ids.includes(x)) : [...new Set([...picked, ...ids])];
  }
  // Start from the theme asked for, or from every theme.
  let picked = $state<string[]>(
    untrack(() => (preselect && withCards.some((t) => t.theme.id === preselect) ? [preselect] : withCards.map((t) => t.theme.id))),
  );
  let mode = $state<CustomMode>('due');
  let limit = $state(20);
  let touchedMode = false;

  const chosen = $derived(withCards.filter((t) => picked.includes(t.theme.id)));
  const counts = $derived({
    due: chosen.reduce((n, t) => n + t.due, 0),
    new: chosen.reduce((n, t) => n + t.fresh, 0),
    practice: chosen.reduce((n, t) => n + t.cards - t.fresh - t.due, 0),
  });
  // Until the learner picks a mode, suggest the most useful one that has cards.
  $effect(() => {
    if (touchedMode) return;
    mode = counts.due > 0 ? 'due' : counts.new > 0 ? 'new' : 'practice';
  });
  const available = $derived(counts[mode]);
  const size = $derived(Math.min(available, limit));

  const MODES: { id: CustomMode; title: string; text: string }[] = [
    { id: 'due', title: 'À réviser', text: 'Les cartes arrivées à échéance dans ces thèmes.' },
    { id: 'new', title: 'Nouvelles cartes', text: 'Apprendre plus aujourd’hui, autant que tu veux. Elles comptent dans ta limite quotidienne : fais d’abord ta séance du jour. Chaque nouvelle carte revient plusieurs fois les semaines suivantes.' },
    { id: 'practice', title: 'Entraînement libre', text: 'Les cartes déjà vues qui ne sont pas encore à réviser, les plus fragiles d’abord. Utile avant un contrôle, un examen ou une présentation ; ne rapporte pas d’XP et consolide moins que la révision au bon moment.' },
  ];
  const LIMITS = [10, 20, 50, Infinity];

  function toggle(id: string) {
    picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
  }
</script>

<main class="page">
  <header>
    <p class="eyebrow">Séance à la carte</p>
    <h1>Choisir quoi réviser</h1>
  </header>

  {#if withCards.length === 0}
    <p class="muted">Crée d’abord des cartes pour pouvoir choisir quoi réviser.</p>
    <a class="btn" href="#creer">Créer une carte</a>
  {:else}
    <section class="panel" aria-labelledby="c-themes">
      <div class="row">
        <h2 id="c-themes">Thèmes</h2>
        <div class="actions">
          <button class="btn small ghost" onclick={() => (picked = withCards.map((t) => t.theme.id))}>Tous</button>
          <button class="btn small ghost" onclick={() => (picked = [])}>Aucun</button>
        </div>
      </div>
      {#each sections as sec (sec.id)}
        {@const ids = sec.themes.map((t) => t.theme.id)}
        <div class="pick-list">
          {#if sections.length > 1}
            <label class="check pick-domain"><input type="checkbox" checked={allIn(ids)} onchange={() => toggleSection(ids)} /><b>{sec.name}</b><span class="muted">tout le domaine</span></label>
          {/if}
          {#each sec.themes as t (t.theme.id)}
            <label class="check pick">
              <input type="checkbox" checked={picked.includes(t.theme.id)} onchange={() => toggle(t.theme.id)} />
              <span class="pick-name">{t.theme.name}</span>
              <span class="muted pick-meta">{t.due} à réviser · {t.fresh} nouvelle{t.fresh > 1 ? 's' : ''} · {t.cards - t.fresh} vue{t.cards - t.fresh > 1 ? 's' : ''}</span>
            </label>
          {/each}
        </div>
      {/each}
    </section>

    <section class="panel" aria-labelledby="c-mode">
      <h2 id="c-mode">Quoi</h2>
      <div class="modes" role="radiogroup" aria-labelledby="c-mode">
        {#each MODES as m (m.id)}
          <label class="mode" class:on={mode === m.id}>
            <input type="radio" name="mode" value={m.id} checked={mode === m.id} onchange={() => { mode = m.id; touchedMode = true; }} />
            <span class="mode-title">{m.title} <span class="pill">{counts[m.id]}</span></span>
            <span class="muted">{m.text}</span>
          </label>
        {/each}
      </div>
      <div class="field">
        <span class="eyebrow" id="c-limit">Combien</span>
        <div class="seg" role="group" aria-labelledby="c-limit">
          {#each LIMITS as l (l)}
            <button type="button" aria-pressed={limit === l} onclick={() => (limit = l)}>{l === Infinity ? 'Tout' : l}</button>
          {/each}
        </div>
      </div>
    </section>

    <button class="btn sun wide" disabled={size === 0} onclick={() => onstart({ themeIds: picked, mode, limit })}>
      {size === 0 ? 'Aucune carte dans cette sélection' : `Commencer (${size} carte${size > 1 ? 's' : ''})`}
    </button>
    {#if mode === 'new' && size > 0}
      <p class="muted">Environ {Math.round(size * progress.loadPerNew)} révisions de plus dans les 30 prochains jours, si tu les réussis à chaque fois.</p>
    {/if}
    {#if size === 0 && picked.length > 0}
      <p class="muted">{mode === 'due' ? 'Rien n’est à réviser dans ces thèmes pour l’instant : essaie l’entraînement libre ou de nouvelles cartes.' : mode === 'new' ? 'Toutes les cartes de ces thèmes ont déjà été vues.' : 'Aucune carte vue de ces thèmes n’est disponible pour l’entraînement : celles qui sont dues sont dans « À réviser ».'}</p>
    {/if}
  {/if}
</main>
