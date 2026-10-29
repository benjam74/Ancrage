<script lang="ts">
  import { tick, untrack } from 'svelte';
  import type { Services } from '../app/services';
  import { buildExercise, expectedText, isCorrect, makeRng, type Answer, type Exercise } from '../core/exercise';
  import type { Mode, ReviewEntry } from '../core/model';
  import { advance, currentCard, isRetry, startRound, type Round } from '../core/round';
  import type { CardState } from '../core/scheduler';
  import { State } from 'ts-fsrs';
  import { MODE_LABEL, RATING_LABEL, inHowLong } from './format';
  import type { Progress, RoundOutcome } from '../app/services';
  import { REPAIR_ROUNDS } from '../core/progress';
  import { HARD_LAPSES } from '../core/hard';
  import type { Verdict } from '../core/evaluate';
  import { createFeedback, primeAudio } from './feedback';
  import Icon from './Icon.svelte';
  import { motionOn, prefs, updatePrefs } from './prefs.svelte';
  import WeekStrip from './WeekStrip.svelte';
  import Avatar from './Avatar.svelte';
  import type { CharacterId, Lang, Slot } from '../core/model';
  import { spokenText } from '../core/speech';
  import { canSpeak, primeSpeech, speak, stopSpeaking } from './voice';
  import { onDestroy } from 'svelte';
  import Choice from './exercises/Choice.svelte';
  import Order from './exercises/Order.svelte';
  import Reveal from './exercises/Reveal.svelte';
  import Typed from './exercises/Typed.svelte';

  let {
    services,
    queue,
    more,
    kind = 'daily',
    look = null,
    onexit,
  }: {
    services: Services;
    queue: string[];
    /** What comes next once a round ends, given the cards already shown in this session. */
    more: (played: Set<string>) => Promise<string[]>;
    /** The daily queue, a picked selection, or free practice (cards reviewed before they are due). */
    kind?: 'daily' | 'custom' | 'practice';
    /** The learner's character, shown celebrating on the streak screen. */
    look?: { character: CharacterId; outfit: Partial<Record<Slot, string>> } | null;
    onexit: () => void;
  } = $props();
  const played = new Set<string>();

  type Shown = { cardId: string; ex: Exercise; mode: Mode; themeName: string; isNew: boolean; retry: boolean; shownAt: number; lapses: number; lang: Lang };
  type Result = { correct: boolean; entry: ReviewEntry | null; state: CardState | null; corrected: boolean };

  let round = $state<Round>(untrack(() => startRound(queue)));
  let roundStartedAt = $state(Date.now());
  let shown = $state<Shown | null>(null);
  let answer = $state<Answer | null>(null);
  let revealed = $state(false);
  /** Claude's verdict on a written scenario answer: highlights the matching grade. */
  let verdict = $state<Verdict | null>(null);
  const SUGGESTED: Record<Verdict, 1 | 2 | 3> = { a_revoir: 1, partiel: 2, reussi: 3 };
  let result = $state<Result | null>(null);
  let ended = $state(false);
  let hasMore = $state(false);
  let roundResult = $state<RoundOutcome | null>(null);
  let after = $state<Progress | null>(null);
  /** The round end shows the summary first, then the streak. */
  let endStep = $state<'summary' | 'streak'>('summary');
  let combo = $state(0);
  /** Count before the last verdict, so a correction can recount it. */
  let comboBefore = 0;
  let bestBefore = 0;
  let bestCombo = $state(0);
  const feedback = createFeedback(() => prefs);
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
    verdict = null;
    result = null;
    played.add(cardId);
    shown = {
      cardId,
      ex,
      mode: ex.kind === 'reveal' ? 'self' : scheduled,
      themeName: ctx.theme.name,
      isNew: state.state === State.New,
      retry: isRetry(round, cardId),
      shownAt: Date.now(),
      lapses: state.lapses,
      lang: ctx.lang,
    };
    if (prefs.readAloud) speak(spokenText(ex, false), ctx.lang);
  }

  async function next() {
    const id = currentCard(round);
    if (id) await show(id);
    else {
      const now = Date.now();
      // A round with no answer (empty queue) is not a finished round.
      // Practice reviews cards before they are due: it earns no round XP and does not count as a study day.
      roundResult = round.answered > 0 && kind !== 'practice' ? await services.completeRound(roundStartedAt, now) : null;
      hasMore = (await more(played)).length > 0;
      after = roundResult ? await services.progress(now) : null;
      endStep = 'summary';
      shown = null;
      result = null;
      ended = true;
      if (roundResult) countUp(roundResult.xp);
    }
  }

  async function recordNow(correct: boolean, grade?: 1 | 2 | 3) {
    if (!shown || result) return;
    if (shown.retry) {
      result = { correct, entry: null, state: null, corrected: false };
      react(correct);
      return;
    }
    const durationMs = Date.now() - shown.shownAt;
    const outcome = grade ? ({ kind: 'self', grade } as const) : ({ kind: 'auto', correct, durationMs, hintUsed: false } as const);
    const { entry, state } = await services.engine.answer(shown.cardId, shown.mode, outcome, Date.now());
    result = { correct, entry, state, corrected: false };
    react(correct);
  }

  /** Answers in a row and the sound or vibration that goes with the verdict. */
  function react(correct: boolean) {
    comboBefore = combo;
    bestBefore = bestCombo;
    combo = correct ? combo + 1 : 0;
    bestCombo = Math.max(bestCombo, combo);
    if (correct) feedback.correct(combo);
    else feedback.wrong();
  }

  function countUp(target: number) {
    xpShown = 0;
    const step = Math.max(1, Math.ceil(target / 30));
    const tick = () => {
      xpShown = Math.min(target, xpShown + step);
      if (xpShown < target) requestAnimationFrame(tick);
    };
    if (!motionOn()) xpShown = target;
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
    combo = flipped ? comboBefore + 1 : 0;
    bestCombo = Math.max(bestBefore, combo);
  });

  const proceed = once(async () => {
    if (!result) return;
    round = advance(round, result.correct);
    await next();
  });

  const nextRound = once(async () => {
    round = startRound(await more(played));
    roundStartedAt = Date.now();
    ended = false;
    combo = 0;
    bestCombo = 0;
    await next();
  });

  /** The answer is on screen: « Écouter » reads it, and so does automatic reading, once. */
  const answerShown = $derived(!!result || revealed);
  let readAnswerFor = '';
  $effect(() => {
    if (!shown || !answerShown || !prefs.readAloud) return;
    // One key per display: `round.done` moves on before the next card shows, `shownAt` does not.
    const key = `${shown.cardId}:${shown.shownAt}`;
    if (readAnswerFor === key) return;
    readAnswerFor = key;
    speak(spokenText(shown.ex, true), shown.lang);
  });
  onDestroy(stopSpeaking);
  const listen = () => shown && speak(spokenText(shown.ex, answerShown), shown.lang);

  /** This answer made the card a hard one. */
  const becameHard = $derived(!!shown && !!result?.state && result.state.lapses >= HARD_LAPSES && shown.lapses < HARD_LAPSES);
  const showStreakStep = $derived(!!roundResult && !!after && prefs.showStreak);
  // Counted per card on its first pass: a card missed then retried is one miss, not two answers.
  const cards = $derived(round.total - round.retried.length);
  const missed = $derived(round.retried.length);

  // The footer button is replaced between steps: keep keyboard focus on it.
  $effect(() => {
    if (!ended) return;
    void endStep;
    tick().then(() => document.querySelector<HTMLButtonElement>('.s-foot .btn')?.focus());
  });

  function finish() {
    if (endStep === 'summary' && showStreakStep) endStep = 'streak';
    else if (hasMore) void nextRound();
    else void exit();
  }

  // Waits for nothing in flight, so the home screen never reads the log before the last answer is saved.
  const exit = once(async () => {
    stopSpeaking();
    onexit();
  });

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
    if (ended) return void finish();
    if (result) return void proceed();
    if (shown?.ex.kind === 'reveal') revealed = true;
    else void check();
  }

  next().catch((e) => (error = String(e)));
</script>

<svelte:window onkeydown={(e) => { if (prefs.sound) primeAudio(); if (prefs.readAloud) primeSpeech(); onkey(e); }} onpointerdown={() => { if (prefs.sound) primeAudio(); if (prefs.readAloud) primeSpeech(); }} />

<div class="session" role="dialog" aria-modal="true" aria-label="Séance de révision">
  <div class="s-head">
    <button class="icon-btn" aria-label="Quitter la séance" onclick={exit}>✕</button>
    <div class="s-progress" class:hot={combo >= 3} role="progressbar" aria-label="Progression de la manche" aria-valuenow={Math.round(progress)} aria-valuemin="0" aria-valuemax="100"><i style="width:{progress}%"></i></div>
    <button class="icon-btn" aria-label="Son" aria-pressed={prefs.sound} onclick={() => updatePrefs({ sound: !prefs.sound })}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {#if prefs.sound}<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />{:else}<path d="m17 9 5 6m0-6-5 6" />{/if}
      </svg>
    </button>
  </div>

  <p class="sr" aria-live="polite">{combo >= 3 ? `${combo} bonnes réponses d’affilée` : ''}</p>
  <div class="s-stage">
    {#if error}
      <div class="s-inner"><p>Une erreur est survenue : {error}</p></div>
    {:else if ended && endStep === 'streak' && roundResult && after}
      <div class="s-inner end" aria-live="polite">
        <div class="streak-hero">
          {#if look}<span class="buddy"><Avatar character={look.character} outfit={look.outfit} pose={motionOn() ? 'jump' : 'idle'} /></span>{:else}<span class="flame"><Icon name="flame" /></span>{/if}
          <span class="n">{roundResult.streak}</span>
          <h1>{roundResult.streak > 1 ? 'jours de série' : 'jour de série'}</h1>
        </div>
        {#if roundResult.milestone}
          <p class="badge">Cap des {roundResult.milestone} jours</p>
          <p class="end-note">{roundResult.milestone >= 30 ? 'Une vraie habitude : elle tient sans effort de volonté.' : 'Une semaine entière. Une habitude met environ deux mois à s’installer : tu es sur la bonne voie.'}</p>
        {:else if roundResult.repaired}
          <p class="end-note"><b>Série récupérée.</b> Le jour manqué ne compte plus contre toi.</p>
        {:else if after.repair && hasMore}
          <p class="end-note">Encore {REPAIR_ROUNDS - after.repair.rounds} manche{REPAIR_ROUNDS - after.repair.rounds > 1 ? 's' : ''} aujourd’hui pour récupérer ta série de {after.repair.lost} jour{after.repair.lost > 1 ? 's' : ''}.</p>
        {:else if roundResult.firstGoalToday}
          <p class="end-note">Journée validée. Reviens demain pour faire grandir ta série.</p>
        {/if}
        <WeekStrip days={after.week} best={after.best} />
        {#if after.freezes > 0}<p class="muted">{after.freezes} gel{after.freezes > 1 ? 's' : ''} en réserve pour un jour sans.</p>{/if}
      </div>
    {:else if ended}
      <div class="s-inner end">
        <h1>Manche terminée</h1>
        {#if roundResult?.comeback}<p class="badge">Bon retour : +20 XP</p>{/if}
        <div class="tiles" class:three={kind !== 'practice'}>
          {#if kind !== 'practice'}<div class="stat-tile" style="--c:var(--sun);--h-ink:var(--on-sun)"><div class="h">XP gagnée</div><div class="v" aria-label="{roundResult?.xp ?? 0} XP">+{xpShown}</div></div>{/if}
          <div class="stat-tile" style="--c:var(--ok);--h-ink:var(--on-ok)"><div class="h">Justes</div><div class="v">{cards - missed}/{cards}</div></div>
          <div class="stat-tile" style="--c:var(--petrol);--h-ink:var(--on-petrol)"><div class="h">Durée</div><div class="v">{Math.max(1, Math.round((Date.now() - roundStartedAt) / 60_000))} min</div></div>
        </div>
        {#if bestCombo >= 3}<p class="combo"><Icon name="flame" />Meilleure série : {bestCombo} d’affilée</p>{/if}
        {#if missed > 0}
          <p class="muted end-note">{missed} carte{missed > 1 ? 's' : ''} reviendr{missed > 1 ? 'ont' : 'a'} bientôt : c’est en {missed > 1 ? 'les' : 'la'} retrouvant que tu {missed > 1 ? 'les ' : 'l’'}ancres.</p>
        {:else if cards > 0}
          <p class="muted end-note">Sans faute. Les prochaines révisions s’espacent.</p>
        {/if}
        {#if kind === 'daily'}
          <p class="muted">{hasMore ? 'Il reste des cartes pour aujourd’hui.' : 'Tout est fait pour aujourd’hui.'}</p>
        {:else}
          <p class="muted">{hasMore ? 'Il reste des cartes dans ta sélection.' : 'Ta sélection est terminée.'}</p>
          {#if kind === 'practice'}<p class="muted end-note">L’entraînement ne rapporte pas d’XP et ne compte pas pour la série : réviser avant l’échéance consolide moins la mémoire que réviser au bon moment.</p>{/if}
        {/if}
      </div>
    {:else if shown}
      {#key shown.cardId + ':' + round.done}
        <div class="s-inner">
          <div class="kicker">
            {#if combo >= 3}<span class="combo" aria-hidden="true"><Icon name="flame" />{combo} d’affilée</span>{/if}
            {#if kind === 'practice'}<span class="pill">Entraînement</span>{/if}
            {#if shown.retry}<span class="pill retry">À revoir</span>{:else if shown.isNew}<span class="pill new">Nouvelle carte</span>{/if}
            <span class="pill">{shown.themeName}</span>
            {#if canSpeak()}
              <button class="icon-btn listen" aria-label={answerShown ? 'Écouter la réponse' : 'Écouter la question'} onclick={listen}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /></svg>
              </button>
            {/if}
          </div>
          {#if shown.ex.kind === 'choice'}
            <Choice ex={shown.ex} bind:answer checked={!!result} />
          {:else if shown.ex.kind === 'typed'}
            <Typed ex={shown.ex} bind:answer checked={!!result} correct={!!result?.correct} lang={shown.lang} />
          {:else if shown.ex.kind === 'order'}
            <Order ex={shown.ex} bind:answer checked={!!result} />
          {:else}
            <Reveal ex={shown.ex} {revealed} bind:verdict lang={shown.lang} />
          {/if}
        </div>
      {/key}
    {/if}
  </div>

  <div class="s-foot" class:ok={result?.correct} class:bad={result && !result.correct}>
    <div class="s-foot-inner">
      {#if ended}
        <span></span>
        {#if endStep === 'summary' && showStreakStep}<button class="btn ok" onclick={finish}>Continuer</button>
        {:else if hasMore}<button class="btn ok" onclick={nextRound}>Manche suivante</button>{:else}<button class="btn ok" onclick={exit}>Terminer</button>{/if}
      {:else if result && shown}
        <div class="verdict" aria-live="polite">
          <h3>{result.correct ? 'Bien joué' : 'Pas tout à fait'}</h3>
          {#if !result.correct && shown.ex.kind !== 'reveal'}<p>Réponse attendue : {expectedText(shown.ex)}</p>{/if}
          {#if result.entry && result.state}
            <p class="engine">{MODE_LABEL[shown.mode]} · noté {RATING_LABEL[result.entry.rating]} · revient {inHowLong(result.state.due.getTime(), Date.now())}</p>
          {:else}
            <p class="engine">Second passage, non enregistré.</p>
          {/if}
          {#if becameHard}<p class="engine">Cette carte te résiste : tu pourras la reformuler depuis la bibliothèque.</p>{/if}
          {#if result.entry && shown.mode !== 'self' && !result.corrected}
            <button class="link" onclick={correct}>{result.correct ? 'En fait, je ne savais pas' : 'J’avais bon'}</button>
          {/if}
        </div>
        <button class="btn" class:ok={result.correct} class:bad={!result.correct} onclick={proceed}>Continuer</button>
      {:else if shown?.ex.kind === 'reveal'}
        {#if revealed}
          <p style="font-weight:700;flex:1 1 200px">{verdict ? 'Claude suggère une note ; c’est toi qui décides.' : 'Compare avec ta réponse. Tu savais ?'}</p>
          <div class="self" class:has-suggestion={!!verdict}>
            <button class="btn bad" class:suggested={verdict && SUGGESTED[verdict] === 1} aria-keyshortcuts="1" onclick={() => record(false, 1)}>Raté{#if verdict && SUGGESTED[verdict] === 1}<span class="sugg">suggéré</span>{/if}</button>
            <button class="btn sun" class:suggested={verdict && SUGGESTED[verdict] === 2} aria-keyshortcuts="2" onclick={() => record(true, 2)}>Difficile{#if verdict && SUGGESTED[verdict] === 2}<span class="sugg">suggéré</span>{/if}</button>
            <button class="btn ok" class:suggested={verdict && SUGGESTED[verdict] === 3} aria-keyshortcuts="3" onclick={() => record(true, 3)}>Su{#if verdict && SUGGESTED[verdict] === 3}<span class="sugg">suggéré</span>{/if}</button>
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
