<script lang="ts">
  import { boot, type Services, type Today } from './app/services';
  import Home from './ui/Home.svelte';
  import Session from './ui/Session.svelte';

  let services = $state<Services | null>(null);
  let today = $state<Today | null>(null);
  let inSession = $state(false);
  let error = $state('');

  async function refresh() {
    if (services) today = await services.today(Date.now());
  }

  boot()
    .then(async (s) => {
      services = s;
      await refresh();
    })
    .catch((e) => (error = String(e)));
</script>

{#if error}
  <main class="page"><h1>Ancrage</h1><p>Impossible d’ouvrir la base locale : {error}</p></main>
{:else if services && today}
  {#if inSession}
    <Session {services} queue={today.queue} onexit={async () => { inSession = false; await refresh(); }} />
  {:else}
    <Home {today} onstart={() => (inSession = true)} />
  {/if}
{:else}
  <main class="page"><p class="muted">Chargement…</p></main>
{/if}
