<script lang="ts">
  import { State } from 'ts-fsrs';
  import { cardVariants } from '../core/cards';
  import { buildExercise, makeRng, type Answer } from '../core/exercise';
  import { selectMode } from '../core/grading';
  import type { Note, NoteFields } from '../core/model';
  import Choice from './exercises/Choice.svelte';
  import Order from './exercises/Order.svelte';
  import Reveal from './exercises/Reveal.svelte';
  import Typed from './exercises/Typed.svelte';

  let { fields, pool, level }: { fields: NoteFields; pool: Note[]; level: 'debutant' | 'avance' } = $props();

  // Same rules as a real session: a new card versus a card stable for a month.
  const card = $derived(level === 'debutant' ? { state: State.New, stability: 0 } : { state: State.Review, stability: 30 });
  const basicDistractors = $derived(pool.filter((n) => n.fields.type === 'basic').length);
  const variants = $derived(cardVariants(fields));
  const exercise = $derived.by(() => {
    if (variants.length === 0) return null;
    const note: Note = { id: 'preview', themeId: '', fields, tags: [], createdAt: 0, updatedAt: 0 };
    try {
      return buildExercise(note, { id: 'preview', noteId: 'preview', variant: variants[0] }, selectMode(fields.type, card, { basicDistractors }), pool, makeRng('preview'));
    } catch {
      return null;
    }
  });
  let answer = $state<Answer | null>(null);
</script>

<div class="phone" inert>
  {#if exercise}
    {#key exercise}
      {#if exercise.kind === 'choice'}
        <Choice ex={exercise} bind:answer checked={false} />
      {:else if exercise.kind === 'typed'}
        <Typed ex={exercise} bind:answer checked={false} correct={false} />
      {:else if exercise.kind === 'order'}
        <Order ex={exercise} bind:answer checked={false} />
      {:else}
        <Reveal ex={exercise} revealed={true} />
      {/if}
    {/key}
  {:else}
    <p class="muted">L’aperçu apparaîtra dès que la note sera complète.</p>
  {/if}
</div>
<p class="muted" style="font-size:14px">Génère <b>{variants.length} carte{variants.length > 1 ? 's' : ''}</b>.</p>
