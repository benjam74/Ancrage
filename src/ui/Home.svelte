<script lang="ts">
  import type { Progress, ShopState, Today } from '../app/services';
  import { CATALOG } from '../data/items';
  import Avatar from './Avatar.svelte';
  import { REPAIR_ROUNDS, dailyRing } from '../core/progress';
  import { studyDayStart } from '../core/queue';
  import { activeTheme, nextText } from './levels';
  import { inHowLong } from './format';
  import Icon from './Icon.svelte';
  import Plan from './Plan.svelte';
  import { prefs } from './prefs.svelte';
  import ThemePath from './ThemePath.svelte';
  import WeekStrip from './WeekStrip.svelte';

  let {
    today,
    progress,
    shop,
    onstart,
    onpick,
  }: { today: Today; progress: Progress; shop: ShopState; onstart: () => void; onpick: (themeId: string | null) => void } = $props();
  const TIERS = ['commun', 'rare', 'epique', 'legendaire'];
  // The goal, or a suggestion: the cheapest item not owned yet in the lowest tier still incomplete.
  const goalItem = $derived(CATALOG.find((i) => i.id === prefs.goal && !shop.owned.has(i.id)));
  const reachedGoal = $derived(!!prefs.goal && shop.owned.has(prefs.goal));
  const suggestion = $derived(
    [...CATALOG].filter((i) => !shop.owned.has(i.id)).sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.price - b.price)[0],
  );
  const target = $derived(goalItem ?? suggestion);
  const total = $derived(today.due + today.fresh);
  const RING = 2 * Math.PI * 42;
  const ring = $derived(dailyRing(progress.answersToday, today.queue.length, prefs.dailyRounds));
  const goalDone = $derived(progress.roundsToday >= prefs.dailyRounds || (progress.roundsToday > 0 && ring.done >= ring.target));
  const ringShare = $derived(goalDone ? 1 : ring.done / ring.target);
  const vsMax = $derived(Math.max(progress.xpWeek, progress.xpPrevAvg ?? 0, 1));
  const focus = $derived(activeTheme(progress.themes));
  const todayIndex = $derived(progress.week.findIndex((d) => d.dayStart === studyDayStart(Date.now())));
  const repairDay = $derived(progress.repair && today.queue.length > 0 && todayIndex > 0 ? progress.week[todayIndex - 1].dayStart : null);
  const days = (n: number) => `${n} jour${n > 1 ? 's' : ''}`;
  const record = $derived(progress.xpPrevBest !== null && progress.xpWeek > progress.xpPrevBest);
</script>

<main class="page home">
  <header class="home-top">
    <div>
      <p class="eyebrow">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <h1>Ancrage</h1>
    </div>
    <div class="chips">
      {#if prefs.showStreak}
        <span class="chip streak" class:off={progress.streak === 0} title="Série de jours"><Icon name="flame" />{progress.streak}<span class="sr">&nbsp;{progress.streak > 1 ? 'jours de série' : 'jour de série'}</span></span>
      {/if}
      <span class="chip xp" title="XP cette semaine"><Icon name="bolt" />{progress.xpWeek.toLocaleString('fr-FR')}<span class="sr">&nbsp;XP cette semaine</span></span>
      {#if prefs.showStreak}
        <span class="chip freeze" title="Gels de série en réserve"><Icon name="snow" />{progress.freezes}<span class="sr">&nbsp;{progress.freezes > 1 ? 'gels' : 'gel'} en réserve</span></span>
      {/if}
    </div>
  </header>

  <div class="home-grid">
    <div style="display:grid;gap:20px">
      <section class="hero" aria-labelledby="today-title">
        <div class="hero-head">
          <svg class="ring" viewBox="0 0 100 100" role="img" aria-label={goalDone ? 'Objectif du jour atteint' : `Objectif du jour : ${ring.done} cartes sur ${ring.target}`}>
            <circle class="track" cx="50" cy="50" r="42" />
            <circle class="fill" cx="50" cy="50" r="42" stroke-dasharray={RING} stroke-dashoffset={RING * (1 - ringShare)} />
            {#if total === 0 && progress.answersToday === 0}
              <text x="50" y="60" text-anchor="middle">–</text>
            {:else if goalDone}
              <text x="50" y="60" text-anchor="middle" style="font-size:30px">✓</text>
            {:else}
              <text x="50" y="54" text-anchor="middle">{ring.done}/{ring.target}</text>
              <text class="ring-sub" x="50" y="70" text-anchor="middle">cartes</text>
            {/if}
          </svg>
          <div>
            <p class="eyebrow">Objectif du jour{prefs.dailyRounds > 1 ? ` · ${prefs.dailyRounds} manches` : ''}</p>
            <h2 id="today-title">{goalDone ? 'Objectif atteint' : total > 0 ? 'Séance du jour' : 'Rien à réviser'}</h2>
          </div>
        </div>
        {#if total > 0}
          <div class="hero-meta">
            <span><b>{today.due}</b> {today.due > 1 ? 'révisions dues' : 'révision due'}</span>
            <span><b>{today.fresh}</b> {today.fresh > 1 ? 'nouvelles cartes' : 'nouvelle carte'}</span>
            <span>≈ <b>{Math.max(1, Math.ceil(Math.min(total, 10) * 0.4))}</b> min</span>
          </div>
          <button class="btn sun wide" class:done={goalDone} onclick={onstart}>{progress.roundsToday > 0 ? 'Refaire une manche' : 'Commencer la séance'}</button>
        {:else}
          <p>{today.nextDue ? `Prochaine révision ${inHowLong(today.nextDue, Date.now())}.` : 'Ajoute des cartes pour commencer.'}</p>
          {#if prefs.showStreak && !progress.todayDone && progress.streak > 0}<p>Rien à réviser aujourd’hui : ta série est préservée.</p>{/if}
        {/if}
        {#if focus && focus.level !== 'Nouveau' && focus.next}<p class="hero-xp">{focus.theme.name} : {nextText(focus).charAt(0).toLowerCase() + nextText(focus).slice(1)}</p>{/if}
        <p class="hero-xp">{progress.xpToday} XP aujourd’hui</p>
        {#if progress.themes.some((t) => t.cards > 0)}
          <button class="btn ghost wide hero-pick" onclick={() => onpick(null)}>{total > 0 ? 'Choisir quoi réviser' : 'S’entraîner ou apprendre plus'}</button>
        {/if}
      </section>

      {#if prefs.showStreak && progress.repair && today.queue.length > 0}
        <section class="nudge" aria-labelledby="nudge-title">
          <h3 id="nudge-title">Récupère ta série de {days(progress.repair.lost)}</h3>
          <p>Elle s’est interrompue hier. Fais {REPAIR_ROUNDS} manches aujourd’hui et le jour manqué ne comptera plus.</p>
          <div class="dots" role="img" aria-label="{progress.repair.rounds} manche sur {REPAIR_ROUNDS}">
            {#each Array(REPAIR_ROUNDS) as _, i (i)}<i class:on={i < progress.repair.rounds}></i>{/each}
          </div>
        </section>
      {:else if progress.freshStart || progress.comebackReady}
        <section class="nudge" aria-labelledby="nudge-title">
          <h3 id="nudge-title">{progress.freshStart === 'month' ? 'Nouveau mois, nouveau départ' : progress.freshStart === 'week' ? 'Nouvelle semaine, nouveau départ' : 'Bon retour !'}</h3>
          {#if progress.comebackReady}<p>Ta première manche aujourd’hui rapporte 20 XP de plus.</p>{:else}<p>{prefs.showStreak ? 'Une manche suffit pour lancer une nouvelle série.' : 'Une manche suffit pour bien démarrer.'}</p>{/if}
        </section>
      {/if}

      <section class="panel week-card" aria-labelledby="week-title">
        <div class="row">
          <h3 id="week-title">Cette semaine</h3>
          {#if record}<span class="badge">Record</span>{/if}
        </div>
        {#if prefs.showStreak}<WeekStrip days={progress.week} best={progress.best} {repairDay} />{/if}
        <div class="vs">
          <div class="vs-row">
            <span>{progress.xpWeek.toLocaleString('fr-FR')} XP</span>
            {#if progress.xpPrevAvg !== null}<span class="muted">ta moyenne : {progress.xpPrevAvg.toLocaleString('fr-FR')} XP</span>{/if}
          </div>
          {#if progress.xpPrevAvg !== null}
            <div class="vs-bar" role="img" aria-label="{progress.xpWeek} XP cette semaine, moyenne {progress.xpPrevAvg} XP">
              <i style="width:{(progress.xpWeek / vsMax) * 100}%"></i>
              <b style="left:calc({(progress.xpPrevAvg / vsMax) * 100}% - 1.5px)"></b>
            </div>
          {:else}
            <p class="muted" style="font-size:14px">Dès la semaine prochaine, tu verras ta semaine comparée à ta moyenne.</p>
          {/if}
        </div>
      </section>

      <section class="panel goal-card" aria-labelledby="goal-title">
        {#if !shop.chosen}
          <div class="mini"><Avatar character="renard" /></div>
          <div style="display:grid;gap:8px">
            <h3 id="goal-title">Ton personnage t’attend, en pyjama</h3>
            <p class="muted">Choisis-le. Ton XP sert aussi à l’habiller.</p>
            <a class="btn small" href="#boutique" style="justify-self:start">Choisir mon personnage</a>
          </div>
        {:else if !target}
          <div class="mini"><Avatar character={shop.avatar.character} outfit={shop.outfit} /></div>
          <div style="display:grid;gap:8px">
            <h3 id="goal-title">Garde-robe complète</h3>
            <p class="muted">Tu possèdes les 50 objets de la boutique.</p>
          </div>
        {:else if target}
          <div class="mini"><Avatar character={shop.avatar.character} outfit={{ ...shop.outfit, [target.slot]: target.id }} decor={target.slot === 'decor'} /></div>
          <div style="display:grid;gap:8px">
            <h3 id="goal-title">{reachedGoal ? 'Objectif atteint ! ' : ''}{goalItem ? `Objectif : ${goalItem.name}` : `Prochain achat : ${target.name}`}</h3>
            <div class="bar" style="--c:var(--sun)" role="img" aria-label="{Math.max(0, shop.balance)} XP sur {target.price}"><i style="width:{Math.min(100, (Math.max(0, shop.balance) / target.price) * 100)}%"></i></div>
            <p class="muted">{shop.balance >= target.price ? 'Tu peux te l’offrir.' : `Plus que ${(target.price - Math.max(0, shop.balance)).toLocaleString('fr-FR')} XP.`}{reachedGoal && !goalItem ? ' Choisis ton prochain objectif dans la boutique.' : ''}</p>
            <a class="btn small ghost" href="#boutique" style="justify-self:start">Boutique</a>
          </div>
        {/if}
      </section>

      <Plan />
    </div>

    <section aria-labelledby="path-title">
      <h2 id="path-title" style="margin-bottom:8px">Ton parcours</h2>
      {#if progress.themes.length}
        <ThemePath themes={progress.themes} {onstart} {onpick} look={{ character: shop.avatar.character, outfit: shop.outfit, name: shop.avatar.name }} />
      {:else}
        <p class="muted">Crée un thème et tes premières cartes pour voir ton parcours.</p>
      {/if}
    </section>
  </div>
</main>
