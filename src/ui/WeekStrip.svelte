<script lang="ts">
  import type { StripDay } from '../core/progress';
  import Icon from './Icon.svelte';

  let { days, best }: { days: StripDay[]; best: number } = $props();
  const LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const LABEL: Record<StripDay['status'], string> = {
    done: 'objectif atteint',
    freeze: 'gel utilisé',
    repaired: 'série récupérée',
    rest: 'rien à réviser',
    missed: 'manqué',
    today: 'aujourd’hui, à faire',
    future: 'à venir',
    none: '',
  };
  const dayName = (d: number) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long' });
</script>

<div class="week">
  <ol class="week-days" aria-label="Cette semaine">
    {#each days as d, i (d.dayStart)}
      <li class="wd {d.status}" aria-label="{dayName(d.dayStart)}{LABEL[d.status] ? ` : ${LABEL[d.status]}` : ''}">
        <span class="wd-dot" aria-hidden="true">
          {#if d.status === 'done' || d.status === 'repaired'}<Icon name="flame" />{:else if d.status === 'freeze'}<Icon name="snow" />{:else if d.status === 'rest'}–{/if}
        </span>
        <span class="wd-l" aria-hidden="true">{LETTERS[i]}</span>
      </li>
    {/each}
  </ol>
  {#if best > 1}<p class="muted week-best">Meilleure série : {best} jours</p>{/if}
</div>
