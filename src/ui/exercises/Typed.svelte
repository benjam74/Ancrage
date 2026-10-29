<script lang="ts">
  import type { Answer, Exercise } from '../../core/exercise';
  import type { Lang } from '../../core/model';
  import Figure from '../Figure.svelte';
  import MicButton from '../MicButton.svelte';

  let { ex, answer = $bindable(), checked, correct, lang = 'fr-FR' }: { ex: Extract<Exercise, { kind: 'typed' }>; answer: Answer | null; checked: boolean; correct: boolean; lang?: Lang } = $props();
  let text = $state('');
  let input: HTMLInputElement | undefined = $state();

  $effect(() => {
    answer = text.trim() ? { kind: 'typed', text } : null;
  });
  $effect(() => {
    input?.focus();
  });
</script>

<h2 class="ex-title">{ex.prompt}</h2>
{#if ex.figure}<Figure figure={ex.figure} uncovered={checked} title={ex.prompt} />{/if}
<div class="cloze" class:solo={!!ex.figure}>
  {ex.before}<input
    bind:this={input}
    bind:value={text}
    class:is-ok={checked && correct}
    class:is-bad={checked && !correct}
    readonly={checked}
    aria-label={ex.figure ? 'Ce que cache la zone' : 'Mot manquant'}
    spellcheck="false"
    autocapitalize="off"
    autocomplete="off"
  />{ex.after}
  {#if !checked}<MicButton {lang} onheard={(t) => (text = t)} />{/if}
</div>
<p class="muted">Saisie libre. Les accents et les majuscules ne comptent pas.</p>
