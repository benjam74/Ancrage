<script lang="ts">
  import type { LibraryTheme, Services } from '../app/services';
  import type { Note, NoteFields, Theme } from '../core/model';
  import { REWORD_INSTRUCTION, describeNote } from '../core/generate';
  import type { Rewrite } from './Generate.svelte';
  import { HARD_LAPSES } from '../core/hard';
  import { LANGS, type Lang, type NewOrder } from '../core/model';
  import { newOrderOf } from '../core/domains';
  import { TYPE_LABEL } from './format';
  import { groupByDomain, isDomain } from '../core/domains';
  import { EXAMPLES } from '../app/current';

  let { services, onedit, onchange, onreword }: { services: Services; onedit: (note: Note) => void; onchange: () => void; onreword: (r: Rewrite) => void } = $props();

  let lib = $state<LibraryTheme[]>([]);
  let confirmNote = $state<string | null>(null);
  let confirmExamples = $state(false);
  let renaming = $state<string | null>(null);
  let renameValue = $state('');
  let newTheme = $state('');
  let newDomain = $state('');
  /** Domain for the « Nouveau thème » form. */
  let themeDomain = $state('');
  let message = $state('');
  let warning = $state('');

  let examples = $state(0);
  let hard = $state<{ note: Note; theme: Theme; lapses: number }[]>([]);
  const aside = $derived(lib.flatMap((t) => t.notes.filter((n) => n.note.suspended).map((n) => ({ ...n, theme: t.theme }))));
  const totalNotes = $derived(lib.reduce((sum, t) => sum + t.notes.length, 0));
  const byId = $derived(new Map(lib.map((t) => [t.theme.id, t])));
  const groups = $derived(groupByDomain(lib.map((t) => t.theme)));
  const domains = $derived(lib.map((t) => t.theme).filter(isDomain));
  /** Open or closed per domain, kept across reloads of the list; by default the first open when there are many. */
  let opened = $state<Record<string, boolean>>({});
  const isOpen = (key: string, first: boolean) => opened[key] ?? (groups.length < 3 || first);
  const hasSchool = $derived(lib.some((t) => t.theme.id.startsWith('c5-')));
  $effect(() => {
    if (!domains.some((d) => d.id === themeDomain)) themeDomain = domains[0]?.id ?? '';
  });

  async function load() {
    [lib, examples, hard] = await Promise.all([services.library(), services.examplesCount(), services.hardNotes(Date.now())]);
  }

  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

  function summary(f: NoteFields): string {
    switch (f.type) {
      case 'basic': return f.front;
      case 'cloze': return f.text.replace(/\{\{(.*?)\}\}/g, '[$1]');
      case 'ordering': return f.title;
      case 'classify': return f.statement;
      case 'mcq': return f.question;
      case 'scenario': return f.situation;
      case 'image': return f.title || `Image, ${f.masks.length} zone${f.masks.length > 1 ? 's' : ''}`;
    }
  }

  async function done(text: string) {
    message = text;
    warning = '';
    await load();
    onchange();
  }

  async function deleteNote(id: string) {
    await services.deleteNote(id);
    confirmNote = null;
    await done('Note supprimée.');
  }

  const LANG_LABEL: Record<Lang, string> = { 'fr-FR': 'Français', 'en-GB': 'Anglais', 'es-ES': 'Espagnol', 'de-DE': 'Allemand', 'it-IT': 'Italien' };

  async function setOrder(d: Theme, order: NewOrder) {
    await services.setNewOrder(d.id, order);
    await done(order === 'mixed' ? `« ${d.name} » : les nouvelles cartes alternent entre ses thèmes.` : `« ${d.name} » : les nouvelles cartes viennent chapitre par chapitre.`);
  }

  async function setLang(t: Theme, value: string) {
    await services.setLang(t.id, value ? (value as Lang) : null);
    await done(`Lecture à voix haute de « ${t.name} » : ${value ? LANG_LABEL[value as Lang] : isDomain(t) ? 'Français' : 'comme le domaine'}.`);
  }

  async function setAside(note: Note, on: boolean) {
    await services.setSuspended(note.id, on, Date.now());
    await done(on ? 'Note mise de côté : elle ne revient plus en révision.' : 'Note reprise : elle revient dans tes révisions.');
  }

  const short = (text: string) => (text.length > 60 ? `${text.slice(0, 60).replace(/\s+\S*$/, '')}…` : text);

  function reword(note: Note) {
    onreword({ nonce: Date.now(), noteId: note.id, source: describeNote(note.fields), themeId: note.themeId, instruction: REWORD_INSTRUCTION, label: short(summary(note.fields)) });
  }

  async function addTheme(e: SubmitEvent) {
    e.preventDefault();
    if (!newTheme.trim()) return;
    const t = await services.createTheme(newTheme, themeDomain || undefined);
    newTheme = '';
    await done(`Thème « ${t.name} » créé.`);
  }

  async function addDomain(e: SubmitEvent) {
    e.preventDefault();
    if (!newDomain.trim()) return;
    const d = await services.createDomain(newDomain);
    newDomain = '';
    themeDomain = d.id;
    await done(`Domaine « ${d.name} » créé.`);
  }

  async function move(themeId: string, domainId: string) {
    await services.moveTheme(themeId, domainId);
    await done('Thème déplacé.');
  }

  async function rename(id: string) {
    await services.renameTheme(id, renameValue);
    renaming = null;
    await done('Thème renommé.');
  }

  async function removeTheme(id: string) {
    const res = await services.deleteTheme(id);
    if (res.ok) await done(byId.get(id) && isDomain(byId.get(id)!.theme) ? 'Domaine supprimé.' : 'Thème supprimé.');
    else warning = res.reason ?? 'Impossible de supprimer ce thème.';
  }

  async function removeExamples() {
    const res = await services.removeExamples();
    confirmExamples = false;
    await done(`Exemples retirés : ${plural(res.notes, 'note')} et ${plural(res.themes, 'thème')}.`);
  }

  load();
</script>

<main class="page">
  <header class="row">
    <div>
      <p class="eyebrow">{totalNotes} note{totalNotes > 1 ? 's' : ''}</p>
      <h1>Bibliothèque</h1>
    </div>
  </header>

  <section class="panel lib-forms" aria-label="Ajouter">
    <form class="actions" onsubmit={addDomain}>
      <label class="eyebrow" for="new-domain" style="align-self:center">Nouveau domaine</label>
      <input id="new-domain" class="inline-input" style="width:auto;flex:1 1 160px" bind:value={newDomain} placeholder="Ex. Mathématiques" />
      <button class="btn small" disabled={!newDomain.trim()}>Créer</button>
    </form>
    <form class="actions" onsubmit={addTheme}>
      <label class="eyebrow" for="new-theme" style="align-self:center">Nouveau thème</label>
      <input id="new-theme" class="inline-input" style="width:auto;flex:1 1 160px" bind:value={newTheme} placeholder={EXAMPLES.theme} />
      {#if domains.length}
        <select class="inline-input" style="width:auto" aria-label="Domaine du nouveau thème" bind:value={themeDomain}>
          {#each domains as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
        </select>
      {/if}
      <button class="btn small" disabled={!newTheme.trim()}>Créer</button>
    </form>
  </section>

  {#if message}<p class="notice" role="status">{message}</p>{/if}
  {#if warning}<p class="notice warn" role="alert">{warning}</p>{/if}

  {#if examples > 0}
    <section class="panel">
      <div class="row">
        <p>Les cartes d’exemple sont chargées. Retire-les quand tu as tes propres cartes{hasSchool ? ' : les domaines et chapitres restent, prêts pour tes cours' : ''}.</p>
        {#if confirmExamples}
          <span class="confirm">Supprimer les {examples} notes d’exemple et leur historique ? Tes propres notes sont conservées.
            <button class="btn small danger" onclick={removeExamples}>Oui, retirer</button>
            <button class="btn small ghost" onclick={() => (confirmExamples = false)}>Annuler</button>
          </span>
        {:else}
          <button class="btn small ghost" onclick={() => (confirmExamples = true)}>Retirer les exemples</button>
        {/if}
      </div>
    </section>
  {/if}

  {#if hard.length}
    <section class="panel" aria-labelledby="hard-title">
      <h2 id="hard-title">Cartes difficiles</h2>
      <p class="muted">Oubliées au moins {HARD_LAPSES} fois. Une carte qui résiste est souvent trop chargée ou ambiguë : reformule-la, scinde-la, ou mets-la de côté.</p>
      <ul class="note-list">
        {#each hard as { note, theme, lapses } (note.id)}
          <li class="note-item">
            <div>
              <p class="summary">{summary(note.fields)}</p>
              <p class="meta"><span class="hard-meta">Oubliée {lapses} fois</span> · {theme.name} · {TYPE_LABEL[note.fields.type]}</p>
            </div>
            <div class="actions">
              <button class="btn small ghost" onclick={() => onedit(note)}>Modifier</button>
              {#if note.fields.type !== 'image'}<button class="btn small ghost" onclick={() => reword(note)}>Reformuler avec l’IA</button>{/if}
              <button class="btn small ghost" onclick={() => setAside(note, true)}>Mettre de côté</button>
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if aside.length}
    <section class="panel" aria-labelledby="aside-title">
      <h2 id="aside-title">Mises de côté</h2>
      <p class="muted">Elles ne reviennent plus en révision et gardent leur historique.</p>
      <ul class="note-list">
        {#each aside as { note, theme } (note.id)}
          <li class="note-item">
            <div>
              <p class="summary">{summary(note.fields)}</p>
              <p class="meta">{theme.name} · {TYPE_LABEL[note.fields.type]}</p>
            </div>
            <div class="actions"><button class="btn small ghost" onclick={() => setAside(note, false)}>Reprendre</button></div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if lib.length === 0}
    <section class="panel"><p>Aucun thème. Crée un thème, puis ajoute tes premières notes depuis « Créer ».</p></section>
  {/if}

  {#each groups as group (group.domain?.id ?? 'loose')}
    {@const key = group.domain?.id ?? 'loose'}
    <details class="domain-block" open={isOpen(key, group === groups[0])} ontoggle={(e) => (opened[key] = e.currentTarget.open)}>
      <summary class="domain-head"><h2 id={`domain-${key}`}>{group.domain?.name ?? 'Sans domaine'}</h2></summary>
      <div class="row">
        {#if group.domain && renaming === group.domain.id}
          <form class="actions" onsubmit={(e) => { e.preventDefault(); rename(group.domain!.id); }}>
            <input class="inline-input" style="width:auto" aria-label="Nouveau nom du domaine" bind:value={renameValue} />
            <button class="btn small">Enregistrer</button>
            <button type="button" class="btn small ghost" onclick={() => (renaming = null)}>Annuler</button>
          </form>
        {:else}
          {#if group.domain}
            {@const domain = group.domain}
            <div class="actions">
              <button class="btn small ghost" onclick={() => { renaming = domain.id; renameValue = domain.name; }}>Renommer le domaine</button>
              <select class="inline-input" style="width:auto" aria-label="Ordre des nouvelles cartes du domaine « {domain.name} »" value={newOrderOf(domain)} onchange={(e) => setOrder(domain, e.currentTarget.value as NewOrder)}>
                <option value="mixed">Nouvelles cartes : tout mélanger</option>
                <option value="chapter">Nouvelles cartes : chapitre par chapitre</option>
              </select>
              <select class="inline-input" style="width:auto" aria-label="Langue de lecture du domaine « {domain.name} »" value={domain.lang ?? 'fr-FR'} onchange={(e) => setLang(domain, e.currentTarget.value === 'fr-FR' ? '' : e.currentTarget.value)}>
                {#each LANGS as l (l)}<option value={l}>Lecture : {LANG_LABEL[l]}</option>{/each}
              </select>
              {#if group.themes.length === 0}<button class="btn small ghost" onclick={() => removeTheme(domain.id)}>Supprimer le domaine</button>{/if}
            </div>
          {/if}
        {/if}
      </div>
      {#if group.themes.length === 0}<p class="muted">Aucun thème dans ce domaine.</p>{/if}
      {#each group.themes as t (t.id)}
      {@const { theme, notes } = byId.get(t.id)!}
    <section class="panel" aria-labelledby={`theme-${theme.id}`}>
      <div class="row">
        {#if renaming === theme.id}
          <form class="actions" onsubmit={(e) => { e.preventDefault(); rename(theme.id); }}>
            <input class="inline-input" style="width:auto" aria-label="Nouveau nom du thème" bind:value={renameValue} />
            <button class="btn small">Enregistrer</button>
            <button type="button" class="btn small ghost" onclick={() => (renaming = null)}>Annuler</button>
          </form>
        {:else}
          <h3 id={`theme-${theme.id}`}>{theme.name}</h3>
          <div class="actions">
            {#if domains.length > 1 || (!group.domain && domains.length)}
              <select class="inline-input" style="width:auto" aria-label="Déplacer « {theme.name} » vers" value="" onchange={(e) => { if (e.currentTarget.value) move(theme.id, e.currentTarget.value); }}>
                <option value="">Déplacer vers…</option>
                {#each domains.filter((d) => d.id !== group.domain?.id) as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
              </select>
            {/if}
            <select class="inline-input" style="width:auto" aria-label="Langue de lecture du thème « {theme.name} »" value={theme.lang ?? ''} onchange={(e) => setLang(theme, e.currentTarget.value)}>
              <option value="">Lecture : comme le domaine</option>
              {#each LANGS as l (l)}<option value={l}>Lecture : {LANG_LABEL[l]}</option>{/each}
            </select>
            <button class="btn small ghost" onclick={() => { renaming = theme.id; renameValue = theme.name; }}>Renommer</button>
            {#if notes.length === 0}<button class="btn small ghost" onclick={() => removeTheme(theme.id)}>Supprimer le thème</button>{/if}
          </div>
        {/if}
      </div>
      {#if notes.length === 0}
        <p class="muted">Aucune note dans ce thème.</p>
      {:else}
        <ul class="note-list">
          {#each notes as { note, cards } (note.id)}
            <li class="note-item">
              <div>
                <p class="summary">{summary(note.fields)}</p>
                <p class="meta">{TYPE_LABEL[note.fields.type]} · {cards} carte{cards > 1 ? 's' : ''}{note.tags.length ? ` · ${note.tags.join(', ')}` : ''}{note.suspended ? ' · mise de côté' : ''}</p>
              </div>
              {#if confirmNote === note.id}
                <span class="confirm">Supprimer avec son historique ?
                  <button class="btn small danger" onclick={() => deleteNote(note.id)}>Supprimer</button>
                  <button class="btn small ghost" onclick={() => (confirmNote = null)}>Annuler</button>
                </span>
              {:else}
                <div class="actions">
                  <button class="btn small ghost" onclick={() => onedit(note)}>Modifier</button>
                  <button class="btn small ghost" onclick={() => (confirmNote = note.id)}>Supprimer</button>
                </div>
              {/if}
            </li>
              {/each}
        </ul>
      {/if}
    </section>
      {/each}
    </details>
  {/each}
</main>
