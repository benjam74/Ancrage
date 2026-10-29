<script lang="ts">
  import type { Services } from '../app/services';
  import { EXAMPLES, coachingProfile, currentProfile, profileStore } from '../app/current';
  import { MAX_COUNT, MAX_SOURCE_CHARS, type Proposal } from '../core/generate';
  import type { NoteType, Theme } from '../core/model';
  import Editor from './Editor.svelte';
  import { TYPE_LABEL } from './format';
  import Preview from './Preview.svelte';
  import { domainOf, groupByDomain, isDomain } from '../core/domains';

  let { services, onchange }: { services: Services; onchange: () => void } = $props();

  const TYPES: NoteType[] = ['basic', 'cloze', 'ordering', 'classify', 'mcq', 'scenario'];
  const store = profileStore();
  const KEY_NAME = 'ancrage.ai.key';

  let themes = $state<Theme[]>([]);
  let allThemes = $state<Theme[]>([]);
  let themeId = $state('');
  let sourceTitle = $state('');
  let source = $state('');
  // Coaching scenarios only make sense for a coaching profile.
  let types = $state<NoteType[]>(TYPES.filter((t) => coachingProfile || t !== 'scenario'));
  let count = $state(8);
  let apiKey = $state(store.get(KEY_NAME) ?? '');
  let keySaved = $state(!!store.get(KEY_NAME));
  let busy = $state(false);
  let error = $state('');
  let notice = $state('');
  type Item = { proposal: Proposal; status: 'pending' | 'added' | 'dismissed' };
  let items = $state.raw<Item[]>([]);
  let rejected = $state(0);
  let editingIndex = $state<number | null>(null);
  let adding = $state(false);

  const pending = $derived(items.filter((i) => i.status === 'pending').length);
  const sourceLabel = $derived(sourceTitle.trim() || 'Texte collé');

  async function loadThemes() {
    allThemes = await services.repo.listThemes();
    themes = allThemes.filter((t) => !isDomain(t)).sort((a, b) => a.order - b.order);
    if (!themes.some((t) => t.id === themeId)) themeId = groupByDomain(allThemes).flatMap((g) => g.themes)[0]?.id ?? '';
  }

  function toggle(t: NoteType) {
    types = types.includes(t) ? types.filter((x) => x !== t) : TYPES.filter((x) => x === t || types.includes(x));
  }

  function saveKey() {
    store.set(KEY_NAME, apiKey.trim());
    keySaved = !!apiKey.trim();
  }

  function forgetKey() {
    store.remove(KEY_NAME);
    apiKey = '';
    keySaved = false;
  }

  async function generate(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    notice = '';
    if (!apiKey.trim()) return void (error = 'Ajoute ta clé API Anthropic pour générer des cartes.');
    await loadThemes();
    if (pending && !confirm(`Remplacer les ${pending} propositions pas encore ajoutées ?`)) return;
    if (!themeId) return void (error = 'Crée d’abord un thème dans la bibliothèque ou l’onglet « Écrire une carte ».');
    busy = true;
    try {
      // Loaded on demand: the SDK is only needed once someone generates.
      const { createAiClient, generateProposals } = await import('../app/ai');
      const theme = themes.find((t) => t.id === themeId)!;
      const res = await generateProposals(createAiClient(apiKey.trim()), { source, themeName: theme.name, domainName: allThemes.find((t) => t.id === domainOf(theme, new Set(allThemes.filter(isDomain).map((d) => d.id))))?.name, audience: currentProfile.audience, types, count });
      if (!res.ok) return void (error = res.error);
      saveKey();
      items = res.proposals.map((proposal) => ({ proposal, status: 'pending' }));
      rejected = res.rejected;
      if (!res.proposals.length) error = 'Aucune carte exploitable dans la réponse. Essaie avec un texte plus riche ou d’autres types.';
    } finally {
      busy = false;
    }
  }

  function mark(index: number, status: Item['status']) {
    items = items.map((item, i) => (i === index ? { ...item, status } : item));
  }

  async function save(index: number): Promise<boolean> {
    const res = await services.saveNote({ themeId, fields: items[index].proposal.fields, tags: ['ia'], source: sourceLabel }, Date.now());
    if (!res.ok) {
      error = res.errors.themeId ?? 'Impossible d’ajouter cette carte.';
      return false;
    }
    mark(index, 'added');
    return true;
  }

  // One save at a time: a double click must not store the same proposal twice.
  async function add(index: number) {
    if (adding) return;
    adding = true;
    error = '';
    try {
      await save(index);
    } finally {
      adding = false;
      onchange();
    }
  }

  async function addAll() {
    if (adding) return;
    adding = true;
    error = '';
    let saved = 0;
    try {
      for (let i = 0; i < items.length; i++) if (items[i].status === 'pending' && (await save(i))) saved++;
    } finally {
      adding = false;
      onchange();
    }
    notice = saved ? `${saved} carte${saved > 1 ? 's' : ''} ajoutée${saved > 1 ? 's' : ''} à ta bibliothèque.` : '';
  }

  loadThemes();
</script>

{#if editingIndex !== null}
  {@const item = items[editingIndex]}
  <Editor
    {services}
    editing={null}
    prefill={{ fields: item.proposal.fields, themeId, tags: ['ia'], source: sourceLabel }}
    onsaved={() => { mark(editingIndex!, 'added'); editingIndex = null; onchange(); }}
    oncancel={() => (editingIndex = null)}
  />
{:else}
  <main class="page wide">
    <header>
      <p class="eyebrow">Avec Claude</p>
      <h1>Générer depuis un texte</h1>
    </header>

    <form class="panel form" onsubmit={generate} novalidate>
      <div class="row2">
        <div class="field">
          <label for="g-theme">Thème des cartes</label>
          <select id="g-theme" bind:value={themeId}>
            {#each groupByDomain(allThemes) as g (g.domain?.id ?? 'loose')}
              {#if g.themes.length}
                <optgroup label={g.domain?.name ?? 'Sans domaine'}>
                  {#each g.themes as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
                </optgroup>
              {/if}
            {/each}
          </select>
        </div>
        <div class="field">
          <label for="g-title">Source</label>
          <input id="g-title" bind:value={sourceTitle} placeholder={EXAMPLES.source} />
        </div>
      </div>
      <div class="field">
        <label for="g-source">Texte</label>
        <textarea id="g-source" bind:value={source} style="min-height:200px" placeholder={EXAMPLES.text}></textarea>
        <span class="hint" class:error={source.length > MAX_SOURCE_CHARS}>{source.length.toLocaleString('fr-FR')} / {MAX_SOURCE_CHARS.toLocaleString('fr-FR')} caractères</span>
      </div>
      <fieldset class="field" style="border:0;padding:0;margin:0">
        <legend class="eyebrow">Types de cartes</legend>
        <div class="actions">
          {#each TYPES as t (t)}
            <label class="check"><input type="checkbox" checked={types.includes(t)} onchange={() => toggle(t)} />{TYPE_LABEL[t]}</label>
          {/each}
        </div>
      </fieldset>
      <div class="row2">
        <div class="field">
          <label for="g-count">Nombre de cartes au plus</label>
          <input id="g-count" type="number" min="1" max={MAX_COUNT} bind:value={count} style="max-width:8em" />
        </div>
        <div class="field">
          <label for="g-key">Clé API Anthropic</label>
          <input id="g-key" type="password" bind:value={apiKey} autocomplete="off" placeholder="sk-ant-…" />
          <span class="hint">
            {keySaved ? 'Clé enregistrée sur cet appareil.' : 'Crée une clé sur console.anthropic.com. Elle reste sur cet appareil.'}
            {#if keySaved}<button type="button" class="link" onclick={forgetKey}>Oublier la clé</button>{/if}
          </span>
        </div>
      </div>
      <p class="muted">
        Le texte collé est envoyé à Anthropic pour générer les cartes (modèle Claude Opus 5.5, facturé sur ta clé : quelques centimes pour un texte de quelques pages). N’y mets pas d’informations sur des clients identifiables. Rien n’est ajouté sans ton accord.
      </p>
      <button class="btn wide" disabled={busy}>{busy ? 'Génération en cours…' : 'Générer les cartes'}</button>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </form>

    {#if items.length}
      <section class="panel" aria-labelledby="g-results">
        <div class="row">
          <h2 id="g-results">{items.length} carte{items.length > 1 ? 's' : ''} proposée{items.length > 1 ? 's' : ''}</h2>
          {#if pending > 1}<button class="btn small" disabled={adding} onclick={addAll}>Tout ajouter ({pending})</button>{/if}
        </div>
        {#if rejected}<p class="muted">{rejected} proposition{rejected > 1 ? 's' : ''} écartée{rejected > 1 ? 's' : ''} (incomplète{rejected > 1 ? 's' : ''} ou d’un type non demandé).</p>{/if}
        <p role="status" class="muted">{notice}</p>
        {#each items as item, i (i)}
          {#if item.status !== 'dismissed'}
            <article class="proposal">
              <div class="editor">
                <div style="display:grid;gap:8px">
                  <span class="pill" style="justify-self:start">{TYPE_LABEL[item.proposal.fields.type]}</span>
                  {#if item.proposal.rationale}<p class="muted">{item.proposal.rationale}</p>{/if}
                  {#if item.status === 'added'}
                    <p class="notice">Ajoutée.</p>
                  {:else}
                    <div class="actions">
                      <button class="btn small" disabled={adding} onclick={() => add(i)}>Ajouter</button>
                      <button class="btn small ghost" disabled={adding} onclick={() => (editingIndex = i)}>Modifier</button>
                      <button class="btn small ghost" onclick={() => mark(i, 'dismissed')}>Écarter</button>
                    </div>
                  {/if}
                </div>
                <Preview fields={item.proposal.fields} pool={[]} level="debutant" />
              </div>
            </article>
          {/if}
        {/each}
      </section>
    {/if}
  </main>
{/if}
