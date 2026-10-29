<script lang="ts">
  import type { Exercise } from '../../core/exercise';
  import type { Evaluation, Verdict } from '../../core/evaluate';
  import { currentProfile, profileStore } from '../../app/current';
  import { onDestroy, tick } from 'svelte';
  import type { Lang } from '../../core/model';
  import Figure from '../Figure.svelte';
  import MicButton from '../MicButton.svelte';

  let { ex, revealed, verdict = $bindable(null), lang = 'fr-FR' }: { ex: Extract<Exercise, { kind: 'reveal' }>; revealed: boolean; verdict?: Verdict | null; lang?: Lang } = $props();
  let draft = $state('');
  let evaluation = $state<Evaluation | null>(null);
  let asking = $state(false);
  let evalError = $state('');
  // The learner may grade and move on before Claude answers: a late answer must not reach the next card.
  let gone = false;
  onDestroy(() => (gone = true));

  const apiKey = profileStore().get('ancrage.ai.key')?.trim() ?? '';
  const canAsk = $derived(!!ex.coaching && !!apiKey && !!draft.trim() && !evaluation);
  const VERDICT_LABEL: Record<Verdict, string> = { reussi: 'Réussi', partiel: 'Partiel', a_revoir: 'À revoir' };

  async function ask() {
    if (asking) return;
    asking = true;
    evalError = '';
    try {
      // Loaded on demand, like generation: the SDK is only needed once someone asks.
      const { createAiClient, evaluateAnswer } = await import('../../app/ai');
      const res = await evaluateAnswer(createAiClient(apiKey), { situation: ex.quote ?? '', model: ex.back, keyPoints: ex.keyPoints, answer: draft, audience: currentProfile.audience });
      if (gone) return;
      if (res.ok) {
        evaluation = res.evaluation;
        verdict = res.evaluation.verdict;
        await tick();
        document.querySelector<HTMLElement>('.ai-eval')?.focus();
      } else evalError = res.error;
    } catch {
      evalError = 'L’évaluation a échoué. Compare toi-même avec la réponse modèle.';
    } finally {
      asking = false;
    }
  }
</script>

<h2 class="ex-title">{ex.prompt}</h2>
{#if ex.figure}<Figure figure={ex.figure} uncovered={revealed} />{/if}
{#if ex.quote}
  <div class="quote">
    <span class="avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><g fill="currentColor"><circle cx="12" cy="8" r="4" /><path d="M4 20.5c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5c0 .6-.4 1-1 1H5c-.6 0-1-.4-1-1z" /></g></svg></span>
    <div class="bubble">{ex.quote}</div>
  </div>
  <label class="eyebrow" for="draft">{ex.front}</label>
  <div class="ta-wrap">
    <textarea id="draft" class="ta" bind:value={draft} readonly={revealed} placeholder="Écris ta réponse, comme en séance…"></textarea>
    {#if !revealed}<MicButton {lang} onheard={(t) => (draft = draft.trim() ? `${draft.trim()} ${t}` : t)} />{/if}
  </div>
  {#if ex.coaching && !revealed && !apiKey}<p class="muted small-note">Avec une clé API Anthropic (Créer → Générer depuis un texte), Claude peut commenter ta réponse.</p>{/if}
{:else if ex.figure}
  <p class="muted">{ex.front}</p>
{:else}
  <div class="flash">{ex.front}</div>
{/if}
<p class="sr" aria-live="polite">{asking ? 'Claude lit ta réponse.' : evaluation ? `Retour de Claude : ${VERDICT_LABEL[evaluation.verdict]}. ${evaluation.feedback}` : ''}</p>
{#if revealed}
  <div class="reveal">
    <p class="eyebrow">Réponse modèle</p>
    <p class="model">{ex.back}</p>
    {#if ex.keyPoints.length && !evaluation}
      <ul class="keys">{#each ex.keyPoints as point, i (i)}<li>{point}</li>{/each}</ul>
    {/if}
  </div>
  {#if canAsk}
    <button class="btn small ghost ask-ai" disabled={asking} onclick={ask}>{asking ? 'Claude lit ta réponse…' : 'Retour de Claude sur ma réponse'}</button>
  {/if}
  {#if evalError}<p class="error" role="alert">{evalError}</p>{/if}
  {#if evaluation}
    <div class="ai-eval" tabindex="-1">
      <p class="eyebrow">Retour de Claude <span class="pill verdict-{evaluation.verdict}">{VERDICT_LABEL[evaluation.verdict]}</span></p>
      {#if evaluation.points.length}
        <ul class="eval-points">
          {#each evaluation.points as p, i (i)}
            <li class:covered={p.covered}><span class="mark" aria-hidden="true">{p.covered ? '✓' : '✗'}</span><span><span class="sr">{p.covered ? 'Couvert : ' : 'Manquant : '}</span><b>{p.point}</b> — {p.comment}</span></li>
          {/each}
        </ul>
      {/if}
      <p>{evaluation.feedback}</p>
      {#if evaluation.improved}<p class="muted"><b>Formulation proposée :</b> {evaluation.improved}</p>{/if}
    </div>
  {/if}
{/if}
