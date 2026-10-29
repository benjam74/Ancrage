<script module lang="ts">
  /** A card to reword: its text, its theme and the instruction, sent by the library (`nonce` changes each time). */
  export type Rewrite = { nonce: number; noteId: string; source: string; themeId: string; instruction: string; label: string };
</script>

<script lang="ts">
  import type { Services } from '../app/services';
  import { EXAMPLES, coachingProfile, currentProfile, profileStore } from '../app/current';
  import { MAX_COUNT, MAX_SOURCE_CHARS, type Proposal } from '../core/generate';
  import type { NoteType, Theme } from '../core/model';
  import Editor from './Editor.svelte';
  import { TYPE_LABEL } from './format';
  import Preview from './Preview.svelte';
  import { domainOf, groupByDomain, isDomain } from '../core/domains';
  import { splitDocument, splitLong, type DocSection } from '../core/importdoc';
  import { untrack } from 'svelte';

  let { services, onchange, rewrite = null }: { services: Services; onchange: () => void; rewrite?: Rewrite | null } = $props();

  const TYPES: NoteType[] = ['basic', 'cloze', 'ordering', 'classify', 'mcq', 'scenario'];
  const store = profileStore();
  const KEY_NAME = 'ancrage.ai.key';
  /** Destination value meaning « a new theme named after the section ». */
  const NEW = '__new';

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
  let progressText = $state('');
  let error = $state('');
  let notice = $state('');
  let instruction = $state('');
  let rewriting = $state<Rewrite | null>(null);
  let rewriteDone = $state(false);

  /** Imported files, one entry per section, each with its destination. */
  type Part = { section: DocSection; on: boolean; dest: string };
  let parts = $state<Part[]>([]);
  let importDomain = $state('');
  let reading = $state(false);
  let importErrors = $state<string[]>([]);
  /** Themes created on the first card added, by name, so the parts of a section share one (the promise: two clicks create one theme). */
  let created: Record<string, Promise<string>> = {};
  /** Theme created only to open the editor: removed again if the editor is cancelled and it stayed empty. */
  let editCreated: string | null = null;

  /** Each proposal keeps the section and destination it was generated for, whatever happens to the import list later. */
  type Item = { proposal: Proposal; status: 'pending' | 'added' | 'dismissed'; part: Part | null };
  let items = $state.raw<Item[]>([]);
  let rejected = $state(0);
  let editingIndex = $state<number | null>(null);
  let adding = $state(false);

  const pending = $derived(items.filter((i) => i.status === 'pending').length);
  const sourceLabel = $derived(sourceTitle.trim() || 'Texte collé');
  const domains = $derived(allThemes.filter(isDomain).sort((a, b) => a.order - b.order));
  const chosenParts = $derived(parts.filter((p) => p.on));
  const groups = $derived(
    items.some((it) => it.part)
      ? [...new Map(items.map((it) => [it.part?.section.id ?? '', it.part])).values()].map((p) => ({
          key: p?.section.id ?? 'all',
          title: p?.section.title ?? '',
          file: p?.section.file ?? '',
          items: items.map((it, j) => ({ it, j })).filter(({ it }) => it.part?.section.id === p?.section.id),
        }))
      : [{ key: 'all', title: '', file: '', items: items.map((it, j) => ({ it, j })) }],
  );
  const fr = (n: number) => n.toLocaleString('fr-FR');

  async function loadThemes() {
    allThemes = await services.repo.listThemes();
    themes = allThemes.filter((t) => !isDomain(t)).sort((a, b) => a.order - b.order);
    if (!themes.some((t) => t.id === themeId)) themeId = groupByDomain(allThemes).flatMap((g) => g.themes)[0]?.id ?? '';
    if (!allThemes.some((t) => t.id === importDomain && isDomain(t))) importDomain = allThemes.filter(isDomain).sort((a, b) => a.order - b.order)[0]?.id ?? '';
  }

  /** Last reword request handled: cancelling must not bring it back. */
  let handledNonce = 0;
  $effect(() => {
    if (!rewrite || rewrite.nonce === handledNonce) return;
    handledNonce = rewrite.nonce;
    if (untrack(() => items.some((i) => i.status === 'pending')) && !confirm('Remplacer les propositions pas encore ajoutées par la reformulation ?')) return;
    rewriting = rewrite;
    rewriteDone = false;
    parts = [];
    source = rewrite.source;
    sourceTitle = rewrite.label;
    themeId = rewrite.themeId;
    instruction = rewrite.instruction;
    count = 3;
    items = [];
    error = '';
    notice = '';
  });

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

  /** Base name of a section, shared by its numbered parts: « Long (2/3) » → « Long ». */
  const baseTitle = (s: DocSection) => s.title.replace(/ \(\d+\/\d+\)$/, '');
  const fileBase = (file: string) => file.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  /** Theme for a section: its title, prefixed by the file when another imported file has a section of that title (« Introduction »). */
  function themeNameOf(s: DocSection): string {
    const title = baseTitle(s);
    const clash = parts.some((p) => p.section.file !== s.file && baseTitle(p.section).toLowerCase() === title.toLowerCase());
    return clash ? `${fileBase(s.file)} — ${title}` : title;
  }

  async function importFiles(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (!files.length) return;
    reading = true;
    importErrors = [];
    await loadThemes();
    const found: DocSection[] = [];
    try {
      for (const file of files) {
        try {
          let text: string;
          if (/\.pdf$/i.test(file.name)) {
            const { pdfText } = await import('../app/pdftext');
            text = await pdfText(await file.arrayBuffer());
            if (!text.trim()) importErrors = [...importErrors, `${file.name} : aucun texte trouvé (PDF scanné ?).`];
          } else text = await file.text();
          found.push(...splitDocument(file.name, text));
        } catch {
          importErrors = [...importErrors, `${file.name} : fichier illisible.`];
        }
      }
    } finally {
      reading = false;
    }
    // Importing a file again (edited since) replaces its sections.
    const again = new Set(found.map((s) => s.file));
    const replaced = parts.some((p) => again.has(p.section.file));
    parts = [...parts.filter((p) => !again.has(p.section.file)), ...splitLong(found).map((section) => ({ section, on: true, dest: NEW }))];
    if (replaced) importErrors = [...importErrors, 'Fichier déjà importé : ses sections ont été remplacées.'];
    rewriting = null;
    instruction = '';
  }

  function clearImport() {
    parts = [];
    importErrors = [];
    created = {};
  }

  function setAll(on: boolean) {
    parts = parts.map((p) => ({ ...p, on }));
  }

  function setPart(i: number, change: Partial<Part>) {
    parts = parts.map((p, j) => (j === i ? { ...p, ...change } : p));
  }

  const domainNameOf = (theme: Theme | undefined) =>
    theme && allThemes.find((t) => t.id === domainOf(theme, new Set(allThemes.filter(isDomain).map((d) => d.id))))?.name;

  async function generate(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    notice = '';
    if (!apiKey.trim()) return void (error = 'Ajoute ta clé API Anthropic pour générer des cartes.');
    await loadThemes();
    if (pending && !confirm(`Remplacer les ${pending} propositions pas encore ajoutées ?`)) return;
    if (parts.length && !chosenParts.length) return void (error = 'Coche au moins une section.');
    if (!parts.length && !themeId) return void (error = 'Crée d’abord un thème dans la bibliothèque ou l’onglet « Écrire une carte ».');
    if (parts.length && chosenParts.some((p) => p.dest === NEW) && !importDomain) return void (error = 'Crée d’abord un domaine dans la bibliothèque.');
    busy = true;
    try {
      // Loaded on demand: the SDK is only needed once someone generates.
      const { createAiClient, generateProposals } = await import('../app/ai');
      const client = createAiClient(apiKey.trim());
      const jobs = parts.length
        ? parts.flatMap((p) => {
            if (!p.on) return [];
            const theme = themes.find((t) => t.id === p.dest);
            return [{ part: { ...p, section: { ...p.section, title: p.section.title } }, source: p.section.text, themeName: theme?.name ?? themeNameOf(p.section), domainName: theme ? domainNameOf(theme) : allThemes.find((t) => t.id === importDomain)?.name }];
          })
        : [{ part: null as Part | null, source, themeName: themes.find((t) => t.id === themeId)!.name, domainName: domainNameOf(themes.find((t) => t.id === themeId)) }];
      const found: Item[] = [];
      let dropped = 0;
      const failures: string[] = [];
      for (const [n, job] of jobs.entries()) {
        progressText = jobs.length > 1 ? `Section ${n + 1} sur ${jobs.length}…` : '';
        const res = await generateProposals(client, { source: job.source, themeName: job.themeName, domainName: job.domainName, audience: currentProfile.audience, types, count, instruction });
        if (!res.ok) {
          // A refused key, no credit or no network fails every section: stop at the first (messages from app/ai.ts).
          if (jobs.length === 1 || /Clé|Crédit|crédit|joindre/.test(res.error)) return void (error = res.error);
          failures.push(`${job.part!.section.title} : ${res.error}`);
          continue;
        }
        saveKey();
        found.push(...res.proposals.map((proposal) => ({ proposal, status: 'pending' as const, part: job.part })));
        dropped += res.rejected;
      }
      items = found;
      rejected = dropped;
      if (failures.length) error = `Certaines sections ont échoué. ${failures.join(' ')}`;
      else if (!found.length) error = 'Aucune carte exploitable dans la réponse. Essaie avec un texte plus riche ou d’autres types.';
    } finally {
      busy = false;
      progressText = '';
    }
  }

  function mark(index: number, status: Item['status']) {
    items = items.map((item, i) => (i === index ? { ...item, status } : item));
  }

  /** Theme of an item; a section's new theme is created on its first card, or reused when the domain has one of that name. */
  async function targetOf(item: Item): Promise<string> {
    if (item.part === null) return themeId;
    const p = item.part;
    if (p.dest !== NEW) return p.dest;
    const name = themeNameOf(p.section);
    const key = `${importDomain}:${name.trim().toLowerCase()}`;
    const known = key in created ? await created[key] : null;
    if (known && (await services.repo.listThemes()).some((t) => t.id === known)) return known;
    created[key] = (async () => {
      const all = await services.repo.listThemes();
      const ids = new Set(all.filter(isDomain).map((d) => d.id));
      const same = all.find((t) => !isDomain(t) && t.name.trim().toLowerCase() === name.trim().toLowerCase() && domainOf(t, ids) === importDomain);
      return same?.id ?? (await services.createTheme(name, importDomain || undefined)).id;
    })();
    return created[key];
  }

  const sourceOf = (item: Item) => (item.part === null ? sourceLabel : `${fileBase(item.part.section.file)} — ${baseTitle(item.part.section)}`);

  async function save(index: number): Promise<boolean> {
    const item = items[index];
    const res = await services.saveNote({ themeId: await targetOf(item), fields: item.proposal.fields, tags: ['ia'], source: sourceOf(item) }, Date.now());
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
      await loadThemes();
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
      await loadThemes();
      onchange();
    }
    notice = saved ? `${saved} carte${saved > 1 ? 's' : ''} ajoutée${saved > 1 ? 's' : ''} à ta bibliothèque.` : '';
  }

  async function putOldAside() {
    if (!rewriting) return;
    await services.setSuspended(rewriting.noteId, true, Date.now());
    rewriteDone = true;
    onchange();
  }

  async function startEdit(index: number) {
    if (adding) return;
    adding = true;
    try {
      const before = new Set((await services.repo.listThemes()).map((t) => t.id));
      editTheme = await targetOf(items[index]);
      editCreated = before.has(editTheme) ? null : editTheme;
      await loadThemes();
      editingIndex = index;
    } finally {
      adding = false;
    }
  }

  async function cancelEdit() {
    editingIndex = null;
    if (editCreated && (await services.repo.listNotes(editCreated)).length === 0) await services.deleteTheme(editCreated);
    editCreated = null;
    await loadThemes();
    onchange();
  }
  let editTheme = $state('');

  loadThemes();
</script>

{#if editingIndex !== null}
  {@const item = items[editingIndex]}
  <Editor
    {services}
    editing={null}
    prefill={{ fields: item.proposal.fields, themeId: editTheme, tags: ['ia'], source: sourceOf(item) }}
    onsaved={() => { mark(editingIndex!, 'added'); editingIndex = null; editCreated = null; onchange(); }}
    oncancel={cancelEdit}
  />
{:else}
  <main class="page wide">
    <header>
      <p class="eyebrow">Avec Claude</p>
      <h1>Générer depuis un texte</h1>
    </header>

    <form class="panel form" onsubmit={generate} novalidate>
      {#if rewriting}
        <p class="notice">Reformulation de « {rewriting.label} ». Claude propose des cartes plus simples ; ajoute celles qui te conviennent puis mets l’ancienne de côté.
          <button type="button" class="link" onclick={() => { rewriting = null; instruction = ''; source = ''; sourceTitle = ''; count = 8; }}>Annuler</button>
        </p>
      {/if}
      {#if parts.length}
        <div class="row">
          <h2 class="eyebrow">Sections importées : {chosenParts.length} sur {parts.length}</h2>
          <div class="actions">
            <button type="button" class="btn small ghost" onclick={() => setAll(true)}>Toutes</button>
            <button type="button" class="btn small ghost" onclick={() => setAll(false)}>Aucune</button>
            <button type="button" class="btn small ghost" onclick={clearImport}>Revenir au texte collé</button>
          </div>
        </div>
        {#if domains.length}
          <div class="field">
            <label for="g-domain">Domaine des nouveaux thèmes</label>
            <select id="g-domain" bind:value={importDomain} style="max-width:22em">
              {#each domains as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
            </select>
          </div>
        {/if}
        <ul class="sections">
          {#each parts as p, i (p.section.id)}
            <li class="section-row">
              <label class="check"><input type="checkbox" checked={p.on} onchange={(e) => setPart(i, { on: e.currentTarget.checked })} />
                <span><b>{p.section.title}</b> <span class="muted">· {p.section.file} · {fr(p.section.text.length)} caractères</span></span>
              </label>
              <select class="inline-input" aria-label="Thème de « {p.section.title} »" value={p.dest} onchange={(e) => setPart(i, { dest: e.currentTarget.value })} disabled={!p.on}>
                <option value={NEW}>Thème « {themeNameOf(p.section)} » (créé au besoin)</option>
                {#each groupByDomain(allThemes) as g (g.domain?.id ?? 'loose')}
                  {#if g.themes.length}
                    <optgroup label={g.domain?.name ?? 'Sans domaine'}>
                      {#each g.themes as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
                    </optgroup>
                  {/if}
                {/each}
              </select>
            </li>
          {/each}
        </ul>
      {:else}
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
          <span class="hint" class:error={source.length > MAX_SOURCE_CHARS}>{fr(source.length)} / {fr(MAX_SOURCE_CHARS)} caractères</span>
        </div>
      {/if}
      {#if !rewriting}
        <div class="field">
          <label class="btn small ghost file-btn" class:disabled={reading}>
            {reading ? 'Lecture des fichiers…' : parts.length ? 'Ajouter des fichiers' : 'Importer des fichiers'}
            <input type="file" aria-describedby="g-files-hint" accept=".md,.markdown,.txt,.pdf,text/markdown,text/plain,application/pdf" multiple onchange={importFiles} disabled={reading} />
          </label>
          <span class="hint" id="g-files-hint">Markdown (un export Obsidian par exemple), texte ou PDF, plusieurs à la fois. Chaque titre devient une section, et chaque section un thème.</span>
          {#each importErrors as msg (msg)}<span class="hint error">{msg}</span>{/each}
        </div>
      {/if}
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
          <label for="g-count">{parts.length ? 'Nombre de cartes au plus, par section' : 'Nombre de cartes au plus'}</label>
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
        {parts.length ? `Chaque section cochée est envoyée à Anthropic, une demande par section (${chosenParts.length} ici, quelques centimes chacune).` : 'Le texte collé est envoyé à Anthropic pour générer les cartes (modèle Claude Opus 5.5, facturé sur ta clé : quelques centimes pour un texte de quelques pages).'}
        N’y mets pas d’informations sur des clients identifiables. Rien n’est ajouté sans ton accord.
      </p>
      <button class="btn wide" disabled={busy || reading}>{busy ? progressText || 'Génération en cours…' : parts.length ? `Générer pour ${chosenParts.length} section${chosenParts.length > 1 ? 's' : ''}` : 'Générer les cartes'}</button>
      <p class="sr" role="status">{progressText}</p>
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
        {#if rewriting && items.some((i) => i.status === 'added')}
          <p class="notice">
            {#if rewriteDone}Ancienne carte mise de côté. Tu peux la reprendre depuis la bibliothèque.
            {:else}Nouvelles cartes ajoutées. <button class="btn small" onclick={putOldAside}>Mettre l’ancienne carte de côté</button>{/if}
          </p>
        {/if}
        {#each groups as g (g.key)}
          {#if g.title}<h3 class="group-title">{g.title} <span class="muted">· {g.file}</span></h3>{/if}
          {#each g.items as { it: item, j: i } (i)}
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
                        <button class="btn small ghost" disabled={adding} onclick={() => startEdit(i)}>Modifier</button>
                        <button class="btn small ghost" onclick={() => mark(i, 'dismissed')}>Écarter</button>
                      </div>
                    {/if}
                  </div>
                  <Preview fields={item.proposal.fields} pool={[]} level="debutant" />
                </div>
              </article>
            {/if}
          {/each}
        {/each}
      </section>
    {/if}
  </main>
{/if}
