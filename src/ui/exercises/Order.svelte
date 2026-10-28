<script lang="ts">
  import { untrack } from 'svelte';
  import type { Answer, Exercise } from '../../core/exercise';

  let { ex, answer = $bindable(), checked }: { ex: Extract<Exercise, { kind: 'order' }>; answer: Answer | null; checked: boolean } = $props();
  // The component is keyed per card, so the initial exercise is the only one it sees.
  let placed = $state<number[]>(untrack(() => ex.shuffled.slice(0, ex.given)));
  const bank = $derived(ex.shuffled.filter((i) => !placed.includes(i)));

  $effect(() => {
    answer = placed.length === ex.steps.length ? { kind: 'order', order: [...placed] } : null;
  });

  function take(i: number) {
    if (!checked) placed = [...placed, i];
  }
  function giveBack(position: number) {
    if (!checked && position >= ex.given) placed = placed.filter((_, p) => p !== position);
  }
</script>

<h2 class="ex-title">{ex.prompt}</h2>
<div class="order-line" aria-label="Ton ordre">
  {#each placed as step, position (step)}
    <button
      class="tile"
      class:locked={position < ex.given}
      class:is-ok={checked && step === position}
      class:is-bad={checked && step !== position}
      disabled={checked || position < ex.given}
      onclick={() => giveBack(position)}
    ><span class="n">{position + 1}</span>{ex.steps[step]}</button>
  {/each}
  {#if placed.length === 0}<span class="muted">Touche les étapes dans le bon ordre.</span>{/if}
</div>
<div class="bank">
  {#each bank as step (step)}
    <button class="tile" disabled={checked} onclick={() => take(step)}>{ex.steps[step]}</button>
  {/each}
</div>
