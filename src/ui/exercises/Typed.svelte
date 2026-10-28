<script lang="ts">
  import type { Answer, Exercise } from '../../core/exercise';

  let { ex, answer = $bindable(), checked, correct }: { ex: Extract<Exercise, { kind: 'typed' }>; answer: Answer | null; checked: boolean; correct: boolean } = $props();
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
<div class="cloze">
  {ex.before}<input
    bind:this={input}
    bind:value={text}
    class:is-ok={checked && correct}
    class:is-bad={checked && !correct}
    readonly={checked}
    aria-label="Mot manquant"
    spellcheck="false"
    autocapitalize="off"
    autocomplete="off"
  />{ex.after}
</div>
<p class="muted">Saisie libre. Les accents et les majuscules ne comptent pas.</p>
