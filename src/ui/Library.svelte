<script lang="ts">
  import type { LibraryTheme, Services } from '../app/services';
  import type { Note, NoteFields } from '../core/model';
  import { TYPE_LABEL } from './format';

  let { services, onedit, onchange }: { services: Services; onedit: (note: Note) => void; onchange: () => void } = $props();

  let lib = $state<LibraryTheme[]>([]);
  let confirmNote = $state<string | null>(null);
  let confirmExamples = $state(false);
  let renaming = $state<string | null>(null);
  let renameValue = $state('');
  let newTheme = $state('');
  let message = $state('');
  let warning = $state('');

  let examples = $state(0);
  const totalNotes = $derived(lib.reduce((sum, t) => sum + t.notes.length, 0));

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
    const t = await services.createTheme(newTheme);
    newTheme = '';
    await done(`Thème « ${t.name} » créé.`);
  }

  async function rename(id: string) {
    await services.renameTheme(id, renameValue);
    renaming = null;
    await done('Thème renommé.');
  }

  async function removeTheme(id: string) {
    const res = await services.deleteTheme(id);
    if (res.ok) await done('Thème supprimé.');
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
    <form class="actions" onsubmit={addTheme}>
      <label class="eyebrow" for="new-theme" style="align-self:center">Nouveau thème</label>
      <input id="new-theme" class="inline-input" style="width:auto" bind:value={newTheme} placeholder="Ex. Écoute active" />
      <button class="btn small" disabled={!newTheme.trim()}>Créer</button>
    </form>
  </header>

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

  {#each lib as { theme, notes } (theme.id)}
    <section class="panel" aria-labelledby={`theme-${theme.id}`}>
      <div class="row">
        {#if renaming === theme.id}
          <form class="actions" onsubmit={(e) => { e.preventDefault(); rename(theme.id); }}>
            <input class="inline-input" style="width:auto" aria-label="Nouveau nom du thème" bind:value={renameValue} />
            <button class="btn small">Enregistrer</button>
            <button type="button" class="btn small ghost" onclick={() => (renaming = null)}>Annuler</button>
          </form>
        {:else}
          <h2 id={`theme-${theme.id}`}>{theme.name}</h2>
          <div class="actions">
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
</main>
