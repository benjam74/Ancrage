<script lang="ts">
  import type { LibraryTheme, Services } from '../app/services';
  import type { Note, NoteFields } from '../core/model';
  import { TYPE_LABEL } from './format';
  import { groupByDomain, isDomain } from '../core/domains';

  let { services, onedit, onchange }: { services: Services; onedit: (note: Note) => void; onchange: () => void } = $props();

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
  const totalNotes = $derived(lib.reduce((sum, t) => sum + t.notes.length, 0));
  const byId = $derived(new Map(lib.map((t) => [t.theme.id, t])));
  const groups = $derived(groupByDomain(lib.map((t) => t.theme)));
  const domains = $derived(lib.map((t) => t.theme).filter(isDomain));
  $effect(() => {
    if (!domains.some((d) => d.id === themeDomain)) themeDomain = domains[0]?.id ?? '';
  });

  async function load() {
    [lib, examples] = await Promise.all([services.library(), services.examplesCount()]);
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
      <input id="new-theme" class="inline-input" style="width:auto;flex:1 1 160px" bind:value={newTheme} placeholder="Ex. Écoute active" />
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
        <p>Le deck de démarrage est chargé. Retire-le quand tu as tes propres cartes.</p>
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

  {#if lib.length === 0}
    <section class="panel"><p>Aucun thème. Crée un thème, puis ajoute tes premières notes depuis « Créer ».</p></section>
  {/if}

  {#each groups as group (group.domain?.id ?? 'loose')}
    <section class="domain-block" aria-labelledby={`domain-${group.domain?.id ?? 'loose'}`}>
      <div class="row domain-head">
        {#if group.domain && renaming === group.domain.id}
          <form class="actions" onsubmit={(e) => { e.preventDefault(); rename(group.domain!.id); }}>
            <input class="inline-input" style="width:auto" aria-label="Nouveau nom du domaine" bind:value={renameValue} />
            <button class="btn small">Enregistrer</button>
            <button type="button" class="btn small ghost" onclick={() => (renaming = null)}>Annuler</button>
          </form>
        {:else}
          <h2 id={`domain-${group.domain?.id ?? 'loose'}`}>{group.domain?.name ?? 'Sans domaine'}</h2>
          {#if group.domain}
            {@const domain = group.domain}
            <div class="actions">
              <button class="btn small ghost" onclick={() => { renaming = domain.id; renameValue = domain.name; }}>Renommer le domaine</button>
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
                <p class="meta">{TYPE_LABEL[note.fields.type]} · {cards} carte{cards > 1 ? 's' : ''}{note.tags.length ? ` · ${note.tags.join(', ')}` : ''}</p>
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
    </section>
  {/each}
</main>
