<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { MAX_EXPLANATION, capExplanation } from '../core/explain';
  import type { Services } from '../app/services';
  import { currentProfile, profileStore } from '../app/current';
  import { describeNote } from '../core/generate';
  import type { Note } from '../core/model';

  /** « Pourquoi ? » after an answer: open when the answer was wrong; Claude can write a missing one. */
  let { services, note, why, open }: { services: Services; note: Note; why: string | null; open: boolean } = $props();

  let text = $state<string | null>(null);
  let proposal = $state('');
  let asking = $state(false);
  let error = $state('');
  let saved = $state(false);
  let gone = false;
  onDestroy(() => (gone = true));

  const shown = $derived(text ?? why);
  const apiKey = profileStore().get('ancrage.ai.key')?.trim() ?? '';

  async function ask() {
    if (asking) return;
    asking = true;
    error = '';
    try {
      const { createAiClient, explainNotes } = await import('../app/ai');
      const res = await explainNotes(createAiClient(apiKey), [{ id: note.id, text: describeNote(note.fields) }], currentProfile.audience);
      if (gone) return;
      if (res.ok) proposal = res.explanations.get(note.id) ?? '';
      else error = res.error;
      if (res.ok && !proposal) error = 'Aucune explication proposée. Réessaie.';
      if (proposal) {
        await tick();
        document.querySelector<HTMLTextAreaElement>('.proposal-why textarea')?.focus();
      }
    } catch {
      error = 'L’explication a échoué. Réessaie plus tard.';
    } finally {
      asking = false;
    }
  }

  async function save() {
    await services.setExplanation(note.id, proposal, Date.now());
    text = capExplanation(proposal);
    proposal = '';
    saved = true;
  }
</script>

{#if shown}
  <details class="why" open={open || saved}>
    <summary>Pourquoi ?</summary>
    <p>{shown}</p>
    {#if saved}<p class="muted small-note" role="status">Explication enregistrée dans la carte.</p>{/if}
  </details>
{:else if proposal}
  <div class="why proposal-why">
    <p class="eyebrow">Explication proposée par Claude</p>
    <textarea class="ta" aria-label="Explication proposée" bind:value={proposal} maxlength={MAX_EXPLANATION}></textarea>
    <p class="muted small-note">Relis-la : Claude n’a que la carte sous les yeux et peut se tromper.</p>
    <div class="actions">
      <button class="btn small" onclick={save} disabled={!proposal.trim()}>Enregistrer dans la carte</button>
      <button class="btn small ghost" onclick={() => (proposal = '')}>Ignorer</button>
    </div>
  </div>
{:else if apiKey}
  <button class="btn small ghost ask-ai" disabled={asking} onclick={ask}>{asking ? 'Claude réfléchit…' : 'Expliquer avec Claude'}</button>
  <p class="sr" aria-live="polite">{asking ? 'Claude rédige une explication.' : ''}</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
{/if}
