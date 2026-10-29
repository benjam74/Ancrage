<script lang="ts">
  import type { Progress } from '../app/services';
  import { prefs } from './prefs.svelte';
  import { TYPE_LABEL } from './format';
  import type { NoteType } from '../core/model';

  let { progress }: { progress: Progress } = $props();

  const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)} %`);
  const ins = $derived(progress.insights);
  const seconds = $derived(ins.medianMs === null ? null : Math.max(1, Math.round(ins.medianMs / 1000)));
  /** A rate on fewer answers than this says little: shown, but flagged. */
  const FEW = 10;

  const level = (n: number) => (n === 0 ? 0 : n < 5 ? 1 : n < 10 ? 2 : n < 20 ? 3 : 4);
  const total = $derived(Object.values(progress.breakdown).reduce((a, b) => a + b, 0));
  const rows = $derived([
    { label: 'Nouvelles', value: progress.breakdown.nouvelles, c: '--sun' },
    { label: 'En apprentissage', value: progress.breakdown.apprentissage, c: '--coral' },
    { label: 'Jeunes', value: progress.breakdown.jeunes, c: '--petrol' },
    { label: 'Ancrées', value: progress.breakdown.ancrees, c: '--ok' },
  ]);

  // Forecast chart: one scale for bars, ticks and labels.
  const W = 340, H = 170, PAD = { l: 26, r: 8, t: 18, b: 24 };
  const dayLabels = $derived(
    progress.forecastDays.map((d, i) => (i === 0 ? 'Auj.' : new Date(d).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''))),
  );
  const max = $derived(Math.max(4, Math.ceil(Math.max(...progress.forecast) / 4) * 4));
  const ticks = $derived([0, max / 4, max / 2, (3 * max) / 4, max]);
  const bw = (W - PAD.l - PAD.r) / 7;
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / max);
</script>

<main class="page home">
  <header>
    <p class="eyebrow">Ta mémoire en chiffres</p>
    <h1>Progrès</h1>
  </header>

  <div class="kpis">
    <div class="panel kpi">
      <span class="eyebrow">Rétention réelle</span>
      <span class="v">{progress.retention === null ? '—' : `${Math.round(progress.retention * 1000) / 10} %`.replace('.', ',')}</span>
      <span class="muted">{progress.retention === null ? 'Disponible après tes premières révisions dues.' : 'Réussite sur les cartes dues, 30 derniers jours. Objectif FSRS : 90 %.'}</span>
    </div>
    <div class="panel kpi">
      <span class="eyebrow">Cartes ancrées</span>
      <span class="v">{progress.breakdown.ancrees} / {total}</span>
      <span class="muted">Stabilité d’au moins 21 jours.</span>
    </div>
    {#if prefs.showStreak}
      <div class="panel kpi">
        <span class="eyebrow">Série</span>
        <span class="v">{progress.streak} jour{progress.streak > 1 ? 's' : ''}</span>
        <span class="muted">{progress.freezes} gel{progress.freezes > 1 ? 's' : ''} en réserve · {progress.xpWeek.toLocaleString('fr-FR')} XP cette semaine.</span>
      </div>
    {:else}
      <div class="panel kpi">
        <span class="eyebrow">Cette semaine</span>
        <span class="v">{progress.xpWeek.toLocaleString('fr-FR')} XP</span>
        <span class="muted">{progress.xpPrevAvg !== null ? `Ta moyenne : ${progress.xpPrevAvg.toLocaleString('fr-FR')} XP.` : 'Première semaine.'}</span>
      </div>
    {/if}
  </div>

  <section class="panel works" aria-labelledby="works-title">
    <h3 id="works-title">Est-ce que ça marche ?</h3>
    <p class="muted">La vraie mesure : la part des cartes que tu retrouves quand elles reviennent à leur date. Entre 80 et 95 %, la répétition espacée fait son travail.</p>
    <div class="works-grid">
      {#each ins.windows as w (w.days)}
        <div class="works-tile">
          <span class="eyebrow">{w.days} derniers jours</span>
          <span class="v">{pct(w.rate)}</span>
          <span class="muted">{w.count ? `réussite sur ${w.count} révision${w.count > 1 ? 's dues' : ' due'}` : 'Pas encore de révision due.'}</span>
          <span class="muted">{w.activeDays} jour{w.activeDays > 1 ? 's' : ''} actif{w.activeDays > 1 ? 's' : ''} sur {w.days}</span>
        </div>
      {/each}
      <div class="works-tile">
        <span class="eyebrow">Temps par carte</span>
        <span class="v">{seconds === null ? '—' : `${seconds} s`}</span>
        <span class="muted">Médiane sur 90 jours.</span>
      </div>
      <div class="works-tile">
        <span class="eyebrow">Cartes difficiles</span>
        <span class="v">{progress.hard}</span>
        <span class="muted">{progress.hard ? 'À reformuler depuis la bibliothèque.' : 'Aucune pour l’instant.'}</span>
      </div>
    </div>
    {#if ins.byType.length || ins.byDomain.length}
      <div class="two">
        {#each [{ title: 'Par type d’exercice', list: ins.byType.map((r) => ({ ...r, label: TYPE_LABEL[r.key as NoteType] ?? r.key })) }, { title: 'Par domaine', list: ins.byDomain.map((r) => ({ ...r, label: r.key })) }] as block (block.title)}
          {#if block.list.length}
            <div>
              <h4>{block.title}, 90 jours</h4>
              {#each block.list as r (r.key)}
                <div class="state-row">
                  <span>{r.label}</span>
                  <div class="bar" style="--c:var({r.rate >= 0.8 ? '--ok' : r.rate >= 0.6 ? '--sun' : '--coral'})"><i style="width:{r.rate * 100}%"></i></div>
                  <span title="{r.count} révisions">{pct(r.rate)}{r.count < FEW ? '*' : ''}</span>
                </div>
              {/each}
            </div>
          {/if}
        {/each}
      </div>
      {#if [...ins.byType, ...ins.byDomain].some((r) => r.count < FEW)}<p class="muted">* Moins de {FEW} révisions : chiffre encore peu fiable.</p>{/if}
    {/if}
  </section>

  <section class="panel">
    <h3>Comment ça marche</h3>
    <ul class="keys">
      <li><b>XP</b> : 10 par carte due, 5 par nouvelle carte, 20 par manche finie. Réviser en avance ne rapporte rien : l’XP récompense ce qui fait mémoriser.</li>
      {#if prefs.showStreak}<li><b>Série</b> : une manche par jour suffit. Un jour manqué consomme un gel s’il en reste (un gagné tous les 7 jours, 2 au plus). Sinon, 2 manches le lendemain récupèrent la série.</li>{/if}
      <li><b>Retour</b> : après au moins 3 jours d’absence, ta première manche rapporte 20 XP de plus.</li>
      <li><b>Habitude</b> : il faut en moyenne deux mois de pratique régulière pour qu’elle tienne seule. Un jour manqué de temps en temps ne l’empêche pas.</li>
    </ul>
  </section>

  <section class="panel">
    <h3>Régularité, 20 dernières semaines</h3>
    <p class="muted">Chaque case est un jour. Plus elle est foncée, plus tu as révisé.</p>
    <div class="heat-wrap">
      <div class="heat" role="img" aria-label="{progress.heatmap.filter((n) => n > 0).length} jours de révision sur 140">
        {#each progress.heatmap as n, i (i)}<i data-l={level(n)} title="{n} révision{n > 1 ? 's' : ''}"></i>{/each}
      </div>
    </div>
  </section>

  <div class="two">
    <section class="panel fc">
      <h3>Révisions prévues, 7 prochains jours</h3>
      <svg viewBox="0 0 {W} {H}" role="img" aria-label="Révisions prévues : {progress.forecast.join(', ')}">
        {#each ticks as t (t)}
          <line class="gridl" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
          <text x={PAD.l - 6} y={y(t) + 4} text-anchor="end">{t}</text>
        {/each}
        {#each progress.forecast as v, i (i)}
          {@const x = PAD.l + i * bw + bw * 0.18}
          <rect class="b" class:today={i === 0} x={x} y={y(v)} width={bw * 0.64} height={Math.max(0, y(0) - y(v))} rx="5" />
          <text class="lbl" x={x + bw * 0.32} y={y(v) - 5} text-anchor="middle">{v}</text>
          <text x={x + bw * 0.32} y={H - 6} text-anchor="middle">{dayLabels[i]}</text>
        {/each}
      </svg>
    </section>
    <section class="panel">
      <h3>État des cartes</h3>
      {#each rows as r (r.label)}
        <div class="state-row">
          <span>{r.label}</span>
          <div class="bar" style="--c:var({r.c})"><i style="width:{total ? (r.value / total) * 100 : 0}%"></i></div>
          <span>{r.value}</span>
        </div>
      {/each}
    </section>
  </div>
</main>
