<script lang="ts">
  import type { Progress, Today } from '../app/services';
  import { inHowLong } from './format';
  import Icon from './Icon.svelte';
  import ThemePath from './ThemePath.svelte';

  let { today, progress, onstart }: { today: Today; progress: Progress; onstart: () => void } = $props();
  const total = $derived(today.due + today.fresh);
  const RING = 2 * Math.PI * 42;
</script>

<main class="page home">
  <header class="home-top">
    <div>
      <p class="eyebrow">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <h1>Ancrage</h1>
    </div>
    <div class="chips">
      <span class="chip streak" class:off={progress.streak === 0} title="Série de jours"><Icon name="flame" />{progress.streak}<span class="sr">&nbsp;{progress.streak > 1 ? 'jours de série' : 'jour de série'}</span></span>
      <span class="chip xp" title="XP cette semaine"><Icon name="bolt" />{progress.xpWeek.toLocaleString('fr-FR')}<span class="sr">&nbsp;XP cette semaine</span></span>
      <span class="chip freeze" title="Gels de série en réserve"><Icon name="snow" />{progress.freezes}<span class="sr">&nbsp;{progress.freezes > 1 ? 'gels' : 'gel'} en réserve</span></span>
    </div>
  </header>

  <div class="home-grid">
    <div style="display:grid;gap:20px">
      <section class="hero" aria-labelledby="today-title">
        <div class="hero-head">
          <svg class="ring" viewBox="0 0 100 100" role="img" aria-label={progress.todayDone ? 'Objectif du jour atteint' : 'Objectif du jour pas encore atteint'}>
            <circle class="track" cx="50" cy="50" r="42" />
            <circle class="fill" cx="50" cy="50" r="42" stroke-dasharray={RING} stroke-dashoffset={progress.todayDone ? 0 : RING} />
            <text x="50" y="58" text-anchor="middle">{progress.todayDone ? '1/1' : '0/1'}</text>
          </svg>
          <div>
            <p class="eyebrow">Objectif du jour</p>
            <h2 id="today-title">{progress.todayDone ? 'Objectif atteint' : total > 0 ? 'Séance du jour' : 'Rien à réviser'}</h2>
          </div>
        </div>
        {#if total > 0}
          <div class="hero-meta">
            <span><b>{today.due}</b> {today.due > 1 ? 'révisions dues' : 'révision due'}</span>
            <span><b>{today.fresh}</b> {today.fresh > 1 ? 'nouvelles cartes' : 'nouvelle carte'}</span>
            <span>≈ <b>{Math.max(1, Math.ceil(total * 0.4))}</b> min</span>
          </div>
          <button class="btn sun wide" class:done={progress.todayDone} onclick={onstart}>{progress.todayDone ? 'Refaire une manche' : 'Commencer la séance'}</button>
        {:else}
          <p>{today.nextDue ? `Prochaine révision ${inHowLong(today.nextDue, Date.now())}.` : 'Ajoute des cartes pour commencer.'}</p>
          {#if !progress.todayDone && progress.streak > 0}<p>Rien à réviser aujourd’hui : ta série est préservée.</p>{/if}
        {/if}
        <p class="hero-xp">{progress.xpToday} XP aujourd’hui</p>
      </section>
      <p class="muted">L’XP récompense les révisions faites à temps : 10 par carte due, 5 par nouvelle carte, 20 par manche. Réviser en avance ne rapporte rien. Un jour manqué consomme un gel s’il en reste : tu en gagnes un tous les 7 jours de série, 2 gels au maximum.</p>
    </div>

    <section aria-labelledby="path-title">
      <h2 id="path-title" style="margin-bottom:8px">Ton parcours</h2>
      {#if progress.themes.length}
        <ThemePath themes={progress.themes} {onstart} />
      {:else}
        <p class="muted">Crée un thème et tes premières cartes pour voir ton parcours.</p>
      {/if}
    </section>
  </div>
</main>
