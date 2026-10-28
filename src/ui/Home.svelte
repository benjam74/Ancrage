<script lang="ts">
  import type { Today } from '../app/services';
  import { inHowLong } from './format';

  let { today, onstart }: { today: Today; onstart: () => void } = $props();
  const total = $derived(today.due + today.fresh);
</script>

<main class="page">
  <header>
    <p class="eyebrow">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    <h1>Ancrage</h1>
  </header>

  {#if total > 0}
    <section class="hero" aria-labelledby="today-title">
      <p class="eyebrow">Objectif du jour</p>
      <h2 id="today-title">Séance du jour</h2>
      <div class="hero-meta">
        <span><b>{today.due}</b> révision{today.due > 1 ? 's' : ''} due{today.due > 1 ? 's' : ''}</span>
        <span><b>{today.fresh}</b> nouvelle{today.fresh > 1 ? 's' : ''} carte{today.fresh > 1 ? 's' : ''}</span>
        <span>≈ <b>{Math.max(1, Math.ceil(total * 0.4))}</b> min</span>
      </div>
      <button class="btn sun wide" onclick={onstart}>Commencer la séance</button>
    </section>
  {:else}
    <section class="hero" aria-labelledby="done-title">
      <p class="eyebrow">Objectif du jour</p>
      <h2 id="done-title">Rien à réviser</h2>
      <p>{today.nextDue ? `Prochaine révision ${inHowLong(today.nextDue, Date.now())}.` : 'Ajoute des cartes pour commencer.'}</p>
    </section>
  {/if}

  <p class="muted">Les révisions dues passent d’abord, puis les nouvelles cartes. Une carte jeune se présente en choix multiple ; une carte solide passe en saisie ou en rappel libre.</p>
</main>
