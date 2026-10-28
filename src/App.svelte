<script lang="ts">
  import { boot, type Progress as ProgressData, type Services, type Today } from './app/services';
  import type { Note } from './core/model';
  import Editor from './ui/Editor.svelte';
  import Home from './ui/Home.svelte';
  import Library from './ui/Library.svelte';
  import Nav from './ui/Nav.svelte';
  import Progress from './ui/Progress.svelte';
  import Session from './ui/Session.svelte';

  const VIEWS = ['accueil', 'creer', 'progres', 'bibliotheque'] as const;
  type View = (typeof VIEWS)[number];
  const fromHash = (): View => {
    const h = location.hash.slice(1);
    return (VIEWS as readonly string[]).includes(h) ? (h as View) : 'accueil';
  };

  let services = $state<Services | null>(null);
  let today = $state<Today | null>(null);
  let progress = $state<ProgressData | null>(null);
  let view = $state<View>(fromHash());
  let editing = $state<Note | null>(null);
  let inSession = $state(false);
  let error = $state('');

  async function refresh() {
    if (!services) return;
    const now = Date.now();
    [today, progress] = await Promise.all([services.today(now), services.progress(now)]);
  }

  function go(next: View) {
    location.hash = next;
  }

  function edit(note: Note) {
    editing = note;
    go('creer');
  }

  boot()
    .then(async (s) => {
      services = s;
      await refresh();
    })
    .catch((e) => (error = String(e)));
</script>

<svelte:window onhashchange={() => { view = fromHash(); if (view !== 'creer') editing = null; window.scrollTo(0, 0); }} />

{#if error}
  <main class="page"><h1>Ancrage</h1><p>Impossible d’ouvrir la base locale : {error}</p></main>
{:else if services && today && progress}
  {#if inSession}
    <Session {services} queue={today.queue} onexit={async () => { inSession = false; await refresh(); }} />
  {:else}
    <div class="app">
      <Nav current={view} onselect={(v) => { if (v === 'creer') editing = null; }} />
      <div class="main">
        {#if view === 'accueil'}
          <Home {today} {progress} onstart={() => (inSession = true)} />
        {:else if view === 'progres'}
          <Progress {progress} />
        {:else if view === 'bibliotheque'}
          <Library {services} onedit={edit} onchange={refresh} />
        {:else}
          {#key editing?.id ?? 'new'}
            <Editor {services} {editing} onsaved={async () => { await refresh(); if (editing) { editing = null; go('bibliotheque'); } }} />
          {/key}
        {/if}
      </div>
    </div>
  {/if}
{:else}
  <main class="page"><p class="muted">Chargement…</p></main>
{/if}
