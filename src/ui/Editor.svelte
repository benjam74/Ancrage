<script lang="ts" module>
  import type { NoteFields } from '../core/model';

  /** A new note started from given content (e.g. a generated proposal), saved as a new note. */
  export interface Prefill {
    fields: NoteFields;
    themeId: string;
    tags: string[];
    source?: string;
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import type { Services } from '../app/services';
  import { FIELD_SPECS, draftToFields, emptyDraft, fieldsToDraft, type Draft } from '../core/draft';
  import type { Note, NoteType, Theme } from '../core/model';
  import { validateFields } from '../core/validate';
  import { TYPE_LABEL } from './format';
  import Preview from './Preview.svelte';
  import ImageMasker from './ImageMasker.svelte';
  import { groupByDomain, isDomain } from '../core/domains';
  import { EXAMPLES } from '../app/current';
  import { prefs } from './prefs.svelte';

  let {
    services,
    editing,
    prefill = null,
    onsaved,
    oncancel,
  }: { services: Services; editing: Note | null; prefill?: Prefill | null; onsaved: () => void; oncancel?: () => void } = $props();

  const TYPES: NoteType[] = ['basic', 'cloze', 'ordering', 'classify', 'mcq', 'scenario', 'image'];
  const ICONS: Record<NoteType, string> = {
    basic: '<rect x="3" y="5" width="13" height="10" rx="2.5"/><path d="M8 19h10.5a2.5 2.5 0 0 0 2.5-2.5V9"/>',
    cloze: '<path d="M3 8h5M16 8h5M3 16h18"/><rect x="9.5" y="5" width="5" height="6" rx="1.5" stroke-dasharray="2 2"/>',
    ordering: '<path d="M9 6h12M9 12h12M9 18h12M4 4.5v3M3 16.5h2l-2 3h2"/>',
    classify: '<rect x="3" y="14" width="5" height="6" rx="1.5"/><rect x="9.5" y="14" width="5" height="6" rx="1.5"/><rect x="16" y="14" width="5" height="6" rx="1.5"/><path d="M12 3v7m0 0-3-3m3 3 3-3"/>',
    mcq: '<circle cx="6" cy="6.5" r="2.5"/><circle cx="6" cy="17.5" r="2.5" fill="currentColor"/><path d="M11 6.5h10M11 17.5h10"/>',
    scenario: '<path d="M4 5h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3.5V15H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/><rect x="13" y="7" width="6" height="4" rx="1" fill="currentColor"/>',
  };

  const initial: Prefill | null = untrack(() => editing ?? prefill);
  let type = $state<NoteType>(initial?.fields.type ?? 'cloze');
  let drafts = $state<Record<NoteType, Draft>>(
    Object.fromEntries(TYPES.map((t) => [t, initial && initial.fields.type === t ? fieldsToDraft(initial.fields) : emptyDraft(t)])) as Record<NoteType, Draft>,
  );
  let themes = $state<Theme[]>([]);
  let themeId = $state(initial?.themeId ?? '');
  let newThemeName = $state('');
  let newThemeDomain = $state('');
  let allThemes = $state<Theme[]>([]);
  const groups = $derived(groupByDomain(allThemes));
  const domains = $derived(allThemes.filter(isDomain));
  let tags = $state(initial?.tags.join(', ') ?? '');
  let source = $state(initial?.source ?? '');
  let level = $state<'debutant' | 'avance'>('debutant');
  let submitted = $state(false);
  let message = $state('');
  let pool = $state<Note[]>([]);
  let saveErrors = $state<Record<string, string>>({});

  const fields = $derived(draftToFields(type, drafts[type]));
  const errors = $derived(submitted ? validateFields(fields) : {});

  async function loadThemes() {
    allThemes = await services.repo.listThemes();
    themes = allThemes.filter((t) => !isDomain(t)).sort((a, b) => a.order - b.order);
    if (!themeId && themes.length) themeId = groups.flatMap((g) => g.themes)[0]?.id ?? themes[0].id;
    // The new theme goes by default into the domain chosen on the home screen.
    if (!domains.some((d) => d.id === newThemeDomain)) newThemeDomain = domains.find((d) => d.id === prefs.domain)?.id ?? domains[0]?.id ?? '';
  }

  $effect(() => {
    const id = themeId;
    const self = untrack(() => editing?.id);
    if (!id || id === '__new') return;
    services.repo.listNotes(id).then((notes) => (pool = notes.filter((n) => n.id !== self)));
  });

  async function createTheme() {
    if (!newThemeName.trim()) return;
    const t = await services.createTheme(newThemeName, newThemeDomain || undefined);
    newThemeName = '';
    await loadThemes();
    themeId = t.id;
  }

  function when(cards: number, today: number): string {
    if (today >= cards) return cards > 1 ? 'Tu les verras dans la séance du jour.' : 'Tu la verras dans la séance du jour.';
    if (today === 0) {
      return cards > 1
        ? 'Elles apparaîtront dans les prochains jours, après les nouvelles cartes déjà en attente.'
        : 'Elle apparaîtra dans les prochains jours, après les nouvelles cartes déjà en attente.';
    }
    return `${today} aujourd’hui, les autres dans les prochains jours.`;
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    submitted = true;
    message = '';
    saveErrors = {};
    if (!themeId || themeId === '__new') return;
    const res = await services.saveNote({ id: editing?.id, themeId, fields, tags: tags.split(','), source }, Date.now());
    if (!res.ok) {
      saveErrors = res.errors;
      if (res.errors.themeId) await loadThemes();
      return;
    }
    if (editing || prefill) return onsaved();
    const theme = themes.find((t) => t.id === themeId)?.name ?? '';
    message = `Ajouté à « ${theme} » : ${res.cards} carte${res.cards > 1 ? 's' : ''}. ${when(res.cards, res.today)}`;
    drafts[type] = emptyDraft(type);
    submitted = false;
    onsaved();
  }

  loadThemes();
</script>

<main class="page wide">
  <header>
    <p class="eyebrow">{editing ? 'Modifier la note' : prefill ? 'Proposition de l’IA' : 'Nouvelle note'}</p>
    <h1>{editing ? 'Modifier une carte' : prefill ? 'Relire la carte proposée' : 'Créer une carte'}</h1>
  </header>

  <div class="types" role="group" aria-label="Type d'exercice">
    {#each TYPES as t (t)}
      <button type="button" class="type-btn" aria-pressed={type === t} disabled={!!editing && editing.fields.type !== t} onclick={() => { type = t; submitted = false; }}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">{@html ICONS[t]}</svg>
        {TYPE_LABEL[t]}
      </button>
    {/each}
  </div>

  {#if message}<p class="notice" role="status">{message}</p>{/if}

  <div class="editor">
    <form class="form" onsubmit={save} autocomplete="off" novalidate>
      <div class="field" class:invalid={submitted && (!themeId || themeId === '__new')}>
        <label for="f-theme">Thème</label>
        <select id="f-theme" bind:value={themeId}>
          {#each groups as g (g.domain?.id ?? 'loose')}
            {#if g.themes.length}
              <optgroup label={g.domain?.name ?? 'Sans domaine'}>
                {#each g.themes as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
              </optgroup>
            {/if}
          {/each}
          <option value="__new">Nouveau thème…</option>
        </select>
        {#if themeId === '__new' || themes.length === 0}
          <div class="actions">
            <input
              class="inline-input"
              style="flex:1"
              aria-label="Nom du nouveau thème"
              bind:value={newThemeName}
              placeholder={EXAMPLES.theme}
              onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createTheme(); } }}
            />
            {#if domains.length}
              <select class="inline-input" style="width:auto" aria-label="Domaine du nouveau thème" bind:value={newThemeDomain}>
                {#each domains as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
              </select>
            {/if}
            <button type="button" class="btn small" onclick={createTheme} disabled={!newThemeName.trim()}>Créer le thème</button>
          </div>
          {#if submitted}<span class="error">Choisis ou crée un thème.</span>{/if}
        {/if}
        {#if saveErrors.themeId}<span class="error" role="alert">{saveErrors.themeId}</span>{/if}
      </div>

      {#if editing && type === 'cloze'}
        <p class="hint muted">Changer le texte d’un trou fait repartir sa carte à zéro. Les autres trous gardent leur historique.</p>
      {/if}

      {#each FIELD_SPECS[type] as spec (type + spec.key)}
        {@const id = `f-${type}-${spec.key}`}
        {#if spec.kind === 'check'}
          <label class="check"><input type="checkbox" {id} bind:checked={drafts[type][spec.key] as boolean} />{spec.label}</label>
        {:else if spec.kind === 'image'}
          <ImageMasker bind:image={drafts[type].image as string} bind:masks={drafts[type].masks as string} imageError={errors.image ?? ''} masksError={errors.masks ?? ''} />
        {:else if spec.kind === 'masks'}
          <!-- Edited together with the image. -->
        {:else}
          <div class="field" class:invalid={!!errors[spec.key]}>
            <label for={id}>{spec.label}</label>
            {#if spec.kind === 'text' || spec.kind === 'list'}
              <input {id} bind:value={drafts[type][spec.key] as string} aria-invalid={!!errors[spec.key]} aria-describedby={`${id}-msg`} />
            {:else}
              <textarea {id} bind:value={drafts[type][spec.key] as string} aria-invalid={!!errors[spec.key]} aria-describedby={`${id}-msg`}></textarea>
            {/if}
            <span id={`${id}-msg`} class={errors[spec.key] ? 'error' : 'hint'}>{errors[spec.key] ?? spec.hint ?? ''}</span>
          </div>
        {/if}
      {/each}

      <div class="field">
        <label for="f-tags">Tags</label>
        <input id="f-tags" bind:value={tags} placeholder="Séparés par des virgules" />
      </div>
      <div class="field">
        <label for="f-source">Source</label>
        <input id="f-source" bind:value={source} placeholder={EXAMPLES.source} />
      </div>
      <button class="btn wide">{editing ? 'Enregistrer les modifications' : 'Ajouter au thème'}</button>
      {#if oncancel}<button type="button" class="btn ghost wide" onclick={oncancel}>Annuler</button>{/if}
    </form>

    <aside class="preview" aria-label="Aperçu">
      <div class="row">
        <p class="eyebrow">Aperçu</p>
        <div class="seg" role="group" aria-label="Niveau de la carte">
          <button type="button" aria-pressed={level === 'debutant'} onclick={() => (level = 'debutant')}>Carte nouvelle</button>
          <button type="button" aria-pressed={level === 'avance'} onclick={() => (level = 'avance')}>Carte solide</button>
        </div>
      </div>
      <Preview {fields} {pool} {level} />
    </aside>
  </div>
</main>
