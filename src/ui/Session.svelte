<script lang="ts">
  import { untrack } from 'svelte';
  import type { Services } from '../app/services';
  import { buildExercise, expectedText, isCorrect, makeRng, type Answer, type Exercise } from '../core/exercise';
  import type { Mode, ReviewEntry } from '../core/model';
  import { advance, currentCard, isRetry, startRound, type Round } from '../core/round';
  import type { CardState } from '../core/scheduler';
  import { State } from 'ts-fsrs';
  import { MODE_LABEL, RATING_LABEL, inHowLong } from './format';
  import Choice from './exercises/Choice.svelte';
  import Order from './exercises/Order.svelte';
  import Reveal from './exercises/Reveal.svelte';
  import Typed from './exercises/Typed.svelte';

  let { services, queue, onexit }: { services: Services; queue: string[]; onexit: () => void } = $props();

  type Shown = { cardId: string; ex: Exercise; mode: Mode; themeName: string; isNew: boolean; retry: boolean; shownAt: number };
  type Result = { correct: boolean; entry: ReviewEntry | null; state: CardState | null; corrected: boolean };

  let round = $state<Round>(untrack(() => startRound(queue)));
  let roundStartedAt = $state(Date.now());
  let shown = $state<Shown | null>(null);
  let answer = $state<Answer | null>(null);
  let revealed = $state(false);
  let result = $state<Result | null>(null);
  let ended = $state(false);
  let hasMore = $state(false);
  let roundResult = $state<{ xp: number; streak: number; firstGoalToday: boolean } | null>(null);
  let xpShown = $state(0);
  let error = $state('');
  let busy = false;

  /** Serializes user actions: a double click must not answer or advance twice. */
  function once(action: () => Promise<void>): () => Promise<void> {
    return async () => {
      if (busy) return;
      busy = true;
      try {
        await action();
      } catch (e) {
        error = String(e);
      } finally {
        busy = false;
      }
    };
  }

  const progress = $derived(round.total ? (round.done / round.total) * 100 : 0);

  async function show(cardId: string) {
    const ctx = await services.context(cardId);
    const state = await services.engine.cardState(cardId);
    const scheduled = await services.engine.modeFor(cardId);
    const ex = buildExercise(ctx.note, ctx.card, scheduled, ctx.pool, makeRng(`${cardId}:${state.reps}:${round.done}`));
    answer = null;
    revealed = false;
    result = null;
    shown = {
      cardId,
      ex,
      mode: ex.kind === 'reveal' ? 'self' : scheduled,
      themeName: ctx.theme.name,
      isNew: state.state === State.New,
      retry: isRetry(round, cardId),
      shownAt: Date.now(),
    };
  }

  async function next() {
    const id = currentCard(round);
    if (id) await show(id);
    else {
      const now = Date.now();
      roundResult = await services.completeRound(roundStartedAt, now);
      hasMore = (await services.today(now)).queue.length > 0;
      shown = null;
      ended = true;
      countUp(roundResult.xp);
    }
  }

  async function recordNow(correct: boolean, grade?: 1 | 2 | 3) {
    if (!shown || result) return;
    if (shown.retry) {
      result = { correct, entry: null, state: null, corrected: false };
      return;
    }
    const durationMs = Date.now() - shown.shownAt;
    const outcome = grade ? ({ kind: 'self', grade } as const) : ({ kind: 'auto', correct, durationMs, hintUsed: false } as const);
    const { entry, state } = await services.engine.answer(shown.cardId, shown.mode, outcome, Date.now());
    result = { correct, entry, state, corrected: false };
  }

  function countUp(target: number) {
    xpShown = 0;
    const step = Math.max(1, Math.ceil(target / 30));
    const tick = () => {
      xpShown = Math.min(target, xpShown + step);
      if (xpShown < target) requestAnimationFrame(tick);
    };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) xpShown = target;
    else requestAnimationFrame(tick);
  }

  const record = (correct: boolean, grade?: 1 | 2 | 3) => once(() => recordNow(correct, grade))();

  const check = once(async () => {
    if (!shown || !answer || result) return;
    await recordNow(isCorrect(shown.ex, answer));
  });

  const correct = once(async () => {
    if (!result?.entry) return;
    const flipped = !result.correct;
    const state = await services.engine.correctLast(result.entry.id, flipped, Date.now());
    const log = await services.repo.listReviews(result.entry.cardId);
    result = { correct: flipped, entry: log[log.length - 1], state, corrected: true };
  });

  const proceed = once(async () => {
    if (!result) return;
    round = advance(round, result.correct);
    await next();
  });

  const nextRound = once(async () => {
    const { queue: fresh } = await services.today(Date.now());
    round = startRound(fresh);
    roundStartedAt = Date.now();
    ended = false;
    await next();
  });

  // Waits for nothing in flight, so the home screen never reads the log before the last answer is saved.
  const exit = once(async () => onexit());

  function onkey(e: KeyboardEvent) {
    if (e.key === 'Escape') return void exit();
    // A focused control handles its own Enter and Space; global shortcuts must not override it.
    if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLTextAreaElement) return;
    if (shown?.ex.kind === 'reveal' && revealed && !result && ['1', '2', '3'].includes(e.key)) {
      const grade = Number(e.key) as 1 | 2 | 3;
      return void record(grade > 1, grade);
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (ended) return void (hasMore ? nextRound() : exit());
    if (result) return void proceed();
    if (shown?.ex.kind === 'reveal') revealed = true;
    else void check();
  }

  next().catch((e) => (error = String(e)));
</script>

<svelte:window onkeydown={onkey} />

<div class="session" role="dialog" aria-modal="true" aria-label="Séance de révision">
  <div class="s-head">
    <button class="icon-btn" aria-label="Quitter la séance" onclick={exit}>✕</button>
    <div class="s-progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin="0" aria-valuemax="100"><i style="width:{progress}%"></i></div>
  </div>

  <div class="s-stage">
    {#if error}
      <div class="s-inner"><p>Une erreur est survenue : {error}</p></div>
    {:else if ended}
      <div class="s-inner end">
        <h1>Manche terminée</h1>
        {#if roundResult}
          <p class="muted" aria-live="polite">
            {roundResult.firstGoalToday ? 'Objectif du jour atteint. ' : ''}Série : {roundResult.streak} jour{roundResult.streak > 1 ? 's' : ''}.
          </p>
        {/if}
        <div class="tiles three">
          <div class="stat-tile" style="--c:var(--sun-deep)"><div class="h">XP gagnée</div><div class="v" aria-label="{roundResult?.xp ?? 0} XP">+{xpShown}</div></div>
          <div class="stat-tile" style="--c:var(--ok)"><div class="h">Précision</div><div class="v">{round.answered ? Math.round((round.correct / round.answered) * 100) : 0} %</div></div>
          <div class="stat-tile" style="--c:var(--petrol)"><div class="h">Durée</div><div class="v">{Math.max(1, Math.round((Date.now() - roundStartedAt) / 60_000))} min</div></div>
        </div>
        <p class="muted">{hasMore ? 'Il reste des cartes pour aujourd’hui.' : 'Tout est fait pour aujourd’hui.'}</p>
      </div>
    {:else if shown}
      {#key shown.cardId + ':' + round.done}
        <div class="s-inner">
          <div class="kicker">
            {#if shown.retry}<span class="pill retry">À revoir</span>{:else if shown.isNew}<span class="pill new">Nouvelle carte</span>{/if}
            <span class="pill">{shown.themeName}</span>
          </div>
          {#if shown.ex.kind === 'choice'}
            <Choice ex={shown.ex} bind:answer checked={!!result} />
          {:else if shown.ex.kind === 'typed'}
            <Typed ex={shown.ex} bind:answer checked={!!result} correct={!!result?.correct} />
          {:else if shown.ex.kind === 'order'}
            <Order ex={shown.ex} bind:answer checked={!!result} />
          {:else}
            <Reveal ex={shown.ex} {revealed} />
          {/if}
        </div>
      {/key}
    {/if}
  </div>

  <div class="s-foot" class:ok={result?.correct} class:bad={result && !result.correct}>
    <div class="s-foot-inner">
      {#if ended}
        <span></span>
        {#if hasMore}<button class="btn ok" onclick={nextRound}>Manche suivante</button>{:else}<button class="btn ok" onclick={exit}>Terminer</button>{/if}
      {:else if result && shown}
        <div class="verdict" aria-live="polite">
          <h3>{result.correct ? 'Bien joué' : 'Pas tout à fait'}</h3>
          {#if !result.correct && shown.ex.kind !== 'reveal'}<p>Réponse attendue : {expectedText(shown.ex)}</p>{/if}
          {#if result.entry && result.state}
            <p class="engine">{MODE_LABEL[shown.mode]} · noté {RATING_LABEL[result.entry.rating]} · revient {inHowLong(result.state.due.getTime(), Date.now())}</p>
          {:else}
            <p class="engine">Second passage, non enregistré.</p>
          {/if}
          {#if result.entry && shown.mode !== 'self' && !result.corrected}
            <button class="link" onclick={correct}>{result.correct ? 'En fait, je ne savais pas' : 'J’avais bon'}</button>
          {/if}
        </div>
        <button class="btn" class:ok={result.correct} class:bad={!result.correct} onclick={proceed}>Continuer</button>
      {:else if shown?.ex.kind === 'reveal'}
        {#if revealed}
          <p style="font-weight:700;flex:1 1 200px">Compare avec ta réponse. Tu savais ?</p>
          <div class="self">
            <button class="btn bad" aria-keyshortcuts="1" onclick={() => record(false, 1)}>Raté</button>
            <button class="btn sun" aria-keyshortcuts="2" onclick={() => record(true, 2)}>Difficile</button>
            <button class="btn ok" aria-keyshortcuts="3" onclick={() => record(true, 3)}>Su</button>
          </div>
        {:else}
          <span></span><button class="btn ok" onclick={() => (revealed = true)}>Afficher la réponse</button>
        {/if}
      {:else}
        <span></span><button class="btn ok" disabled={!answer} onclick={check}>Vérifier</button>
      {/if}
    </div>
  </div>
</div>
