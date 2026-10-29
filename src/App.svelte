<script lang="ts">
  import { boot, type Progress as ProgressData, type Services, type ShopState, type Today } from './app/services';
  import Shop from './ui/Shop.svelte';
  import { createCloudSync, type CloudSync } from './app/cloud';
  import { currentProfile, mustChoose, profileStore } from './app/current';
  import WhoReviews from './ui/WhoReviews.svelte';
  import type { Note } from './core/model';
  import Editor from './ui/Editor.svelte';
  import Generate, { type Rewrite } from './ui/Generate.svelte';
  import Home from './ui/Home.svelte';
  import Library from './ui/Library.svelte';
  import Nav from './ui/Nav.svelte';
  import Progress from './ui/Progress.svelte';
  import Settings from './ui/Settings.svelte';
  import { registerSW } from 'virtual:pwa-register';
  import Session from './ui/Session.svelte';
  import { prefs } from './ui/prefs.svelte';
  import Custom from './ui/Custom.svelte';
  import type { CustomChoice } from './core/queue';

  const VIEWS = ['accueil', 'creer', 'progres', 'bibliotheque', 'boutique', 'reglages', 'reviser'] as const;
  type View = (typeof VIEWS)[number];
  const fromHash = (): View => {
    const h = location.hash.slice(1);
    return (VIEWS as readonly string[]).includes(h) ? (h as View) : 'accueil';
  };

  let services = $state<Services | null>(null);
  let cloud = $state<CloudSync | null>(null);
  let today = $state<Today | null>(null);
  let progress = $state<ProgressData | null>(null);
  let shop = $state.raw<ShopState | null>(null);
  let view = $state<View>(fromHash());
  let editing = $state<Note | null>(null);
  let createMode = $state<'write' | 'generate'>('write');
  // Generate is mounted on first use, then kept mounted so its work survives navigation.
  let generateOpened = $state(false);
  let inSession = $state(false);
  type SessionSpec = { queue: string[]; more: (played: Set<string>) => Promise<string[]>; kind: 'daily' | 'custom' | 'practice' };
  let spec = $state.raw<SessionSpec | null>(null);
  let preselect = $state<string | null>(null);
  let rewrite = $state.raw<Rewrite | null>(null);
  let customEmpty = $state('');

  function startDaily() {
    if (!services || !today) return;
    const s = services;
    spec = { queue: today.queue, more: async () => (await s.today(Date.now())).queue, kind: 'daily' };
    inSession = true;
  }

  async function startCustom(choice: CustomChoice) {
    if (!services) return;
    const s = services;
    // The selection is fixed at the start; later rounds play what is left of it.
    const all = await s.custom(Date.now(), choice);
    if (!all.length) return void (customEmpty = 'Plus aucune carte dans cette sélection.');
    customEmpty = '';
    spec = { queue: all, more: async (played) => all.filter((id) => !played.has(id)), kind: choice.mode === 'practice' ? 'practice' : 'custom' };
    inSession = true;
  }

  function pick(themeId: string | null) {
    preselect = themeId;
    go('reviser');
  }
  let error = $state('');
  let updateReady = $state(false);
  let reloadAfterSession = false;
  // Another window may install the update: never reload in the middle of a round.
  const updateSW = registerSW({
    onNeedRefresh: () => (updateReady = true),
    onNeedReload: () => {
      if (inSession) reloadAfterSession = true;
      else location.reload();
    },
  });

  $effect(() => {
    document.documentElement.dataset.motion = prefs.motion ? 'on' : 'off';
  });

  async function refresh() {
    if (!services) return;
    const now = Date.now();
    [today, progress, shop] = await Promise.all([services.today(now), services.progress(now), services.shop(now)]);
  }

  function go(next: View) {
    location.hash = next;
  }

  function edit(note: Note) {
    editing = note;
    go('creer');
  }

  let lastSync = 0;
  /** Background sync: refreshes the screen when it brought something, stays silent otherwise. */
  async function syncInBackground() {
    if (!cloud || inSession) return;
    lastSync = Date.now();
    const res = await cloud.sync();
    if (res.state === 'ok' && !inSession) await refresh();
  }

  // With several profiles, the tab opens on « Qui révise ? » before loading anyone's data.
  let picking = $state(mustChoose);
  const start = () =>
  boot(currentProfile)
    .then(async (s) => {
      services = s;
      cloud = createCloudSync(s.repo, profileStore());
      await refresh();
      void syncInBackground();
    })
    .catch((e) => (error = String(e)));
  if (!mustChoose) start();
</script>

<svelte:document onvisibilitychange={() => { if (document.visibilityState === 'visible' && Date.now() - lastSync > 60_000) void syncInBackground(); }} />
<svelte:window onhashchange={() => { view = fromHash(); if (view !== 'creer') editing = null; if (view !== 'reviser') { preselect = null; customEmpty = ''; } window.scrollTo(0, 0); }} />

{#if picking}
  <WhoReviews current={currentProfile.id} onkeep={() => { picking = false; start(); }} />
{:else if error}
  <main class="page"><h1>Ancrage</h1><p>Impossible d’ouvrir la base locale : {error}</p></main>
{:else if services && today && progress && shop}
  {#if inSession}
    <Session {services} queue={spec?.queue ?? today.queue} more={spec?.more ?? (async () => [])} kind={spec?.kind ?? 'daily'} look={{ character: shop.avatar.character, outfit: shop.outfit }} onexit={async () => { if (reloadAfterSession) return location.reload(); await refresh(); inSession = false; spec = null; void syncInBackground(); }} />
  {:else}
    {#if updateReady}
      <div class="update" role="status">
        <span>Une nouvelle version d’Ancrage est disponible.</span>
        <button class="btn small" onclick={() => updateSW(true)}>Mettre à jour</button>
        <button class="btn small ghost" onclick={() => (updateReady = false)}>Plus tard</button>
      </div>
    {/if}
    <div class="app">
      <Nav current={view} onselect={(v) => { if (v === 'creer') editing = null; }} />
      <div class="main">
        {#if view === 'accueil'}
          <Home {today} {progress} {shop} onstart={startDaily} onpick={pick} />
        {:else if view === 'boutique'}
          <Shop {services} {shop} onchange={refresh} />
        {:else if view === 'reviser'}
          {#key preselect}<Custom {progress} {preselect} onstart={startCustom} />{/key}
          {#if customEmpty}<p class="page muted" role="status">{customEmpty}</p>{/if}
        {:else if view === 'progres'}
          <Progress {progress} />
        {:else if view === 'reglages'}
          {#if cloud}<Settings {services} {cloud} onchange={refresh} />{/if}
        {:else if view === 'bibliotheque'}
          <Library {services} onedit={edit} onchange={refresh} onreword={(r) => { rewrite = r; createMode = 'generate'; generateOpened = true; editing = null; go('creer'); }} />
        {:else}
          {#if !editing}
            <div class="tabs" role="group" aria-label="Façon de créer">
              <button aria-pressed={createMode === 'write'} onclick={() => (createMode = 'write')}>Écrire une carte</button>
              <button aria-pressed={createMode === 'generate'} onclick={() => { createMode = 'generate'; generateOpened = true; }}>Générer depuis un texte</button>
            </div>
          {/if}
          {#if createMode !== 'generate' || editing}
            {#key editing?.id ?? 'new'}
              <Editor {services} {editing} onsaved={async () => { await refresh(); if (editing) { editing = null; go('bibliotheque'); } }} />
            {/key}
          {/if}
        {/if}
        {#if generateOpened}
          <div hidden={view !== 'creer' || createMode !== 'generate' || !!editing}>
            <Generate {services} onchange={refresh} {rewrite} />
          </div>
        {/if}
      </div>
    </div>
  {/if}
{:else}
  <main class="page"><p class="muted">Chargement…</p></main>
{/if}
