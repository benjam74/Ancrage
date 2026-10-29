<script lang="ts">
  import type { Figure } from '../core/exercise';

  /** The image with the zone to find hidden behind « ? »; `uncovered` shows it with its answer. */
  let { figure, uncovered }: { figure: Figure; uncovered: boolean } = $props();
  const target = $derived(figure.masks.find((m) => m.id === figure.target));
</script>

<div class="figure">
  <img src={figure.src} alt={uncovered && target?.label ? `Image, zone découverte : ${target.label}` : 'Image avec une zone masquée'} draggable="false" />
  {#if target}
    <div
      class="zone target"
      class:uncovered
      style="left:{target.x * 100}%;top:{target.y * 100}%;width:{target.w * 100}%;height:{target.h * 100}%"
      aria-hidden="true"
    >{uncovered ? '' : '?'}</div>
    {#if uncovered && target.label}
      <span class="zone-label" class:above={target.y + target.h > 0.85} style="left:{Math.min(target.x, 0.7) * 100}%;top:{(target.y + target.h > 0.85 ? target.y : target.y + target.h) * 100}%">{target.label}</span>
    {/if}
  {/if}
</div>
