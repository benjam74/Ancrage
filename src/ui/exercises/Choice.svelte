<script lang="ts">
  import type { Answer, Exercise } from '../../core/exercise';

  let { ex, answer = $bindable(), checked }: { ex: Extract<Exercise, { kind: 'choice' }>; answer: Answer | null; checked: boolean } = $props();
  const picked = $derived(answer?.kind === 'choice' ? answer.index : null);

  function pick(index: number) {
    if (!checked) answer = { kind: 'choice', index };
  }
  function onkey(e: KeyboardEvent) {
    if (checked || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= ex.options.length) pick(n - 1);
  }
</script>

<svelte:window onkeydown={onkey} />

<h2 class="ex-title">{ex.prompt}</h2>
{#if ex.quote}
  <div class="quote">
    <span class="avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><g fill="currentColor"><circle cx="12" cy="8" r="4" /><path d="M4 20.5c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5c0 .6-.4 1-1 1H5c-.6 0-1-.4-1-1z" /></g></svg></span>
    <div class="bubble">{ex.quote}</div>
  </div>
{/if}
<div class="opts">
  {#each ex.options as option, i (i)}
    <button
      class="opt"
      class:is-ok={checked && i === ex.answerIndex}
      class:is-bad={checked && i === picked && i !== ex.answerIndex}
      aria-pressed={picked === i}
      disabled={checked}
      onclick={() => pick(i)}
    ><span class="k">{i + 1}</span>{option}</button>
  {/each}
</div>
