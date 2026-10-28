<script lang="ts">
  import type { Exercise } from '../../core/exercise';

  let { ex, revealed }: { ex: Extract<Exercise, { kind: 'reveal' }>; revealed: boolean } = $props();
  let draft = $state('');
</script>

<h2 class="ex-title">{ex.prompt}</h2>
{#if ex.quote}
  <div class="quote">
    <span class="avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><g fill="currentColor"><circle cx="12" cy="8" r="4" /><path d="M4 20.5c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5c0 .6-.4 1-1 1H5c-.6 0-1-.4-1-1z" /></g></svg></span>
    <div class="bubble">{ex.quote}</div>
  </div>
  <label class="eyebrow" for="draft">{ex.front}</label>
  <textarea id="draft" class="ta" bind:value={draft} readonly={revealed} placeholder="Écris ta réponse, comme en séance…"></textarea>
{:else}
  <div class="flash">{ex.front}</div>
{/if}
{#if revealed}
  <div class="reveal">
    <p class="eyebrow">Réponse modèle</p>
    <p class="model">{ex.back}</p>
    {#if ex.keyPoints.length}
      <ul class="keys">{#each ex.keyPoints as point, i (i)}<li>{point}</li>{/each}</ul>
    {/if}
  </div>
{/if}
