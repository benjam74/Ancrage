<script lang="ts">
  import type { StripDay } from '../core/progress';
  import Icon from './Icon.svelte';

  /** `repairDay`: the missed day that today can still repair, shown as such. */
  let { days, best, repairDay = null }: { days: StripDay[]; best: number; repairDay?: number | null } = $props();
  const LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const LABEL: Record<StripDay['status'], string> = {
    done: 'manche faite',
    freeze: 'gel utilisé',
    repaired: 'série récupérée',
    rest: 'rien à réviser',
    missed: 'pas de manche',
    today: 'aujourd’hui, à faire',
    future: 'à venir',
    none: '',
  };
  const dayName = (d: number) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long' });
  const label = (d: StripDay) => (d.dayStart === repairDay ? 'à récupérer aujourd’hui' : LABEL[d.status]);
</script>

<div class="week">
  <ol class="week-days" aria-label="Cette semaine">
    {#each days as d, i (d.dayStart)}
      <li class="wd {d.status}" class:repairable={d.dayStart === repairDay} aria-label="{dayName(d.dayStart)}{label(d) ? ` : ${label(d)}` : ''}">
        <span class="wd-dot" aria-hidden="true">
          {#if d.status === 'done' || d.status === 'repaired'}<Icon name="flame" />{:else if d.status === 'freeze'}<Icon name="snow" />{:else if d.status === 'rest'}–{:else if d.dayStart === repairDay}?{/if}
        </span>
        <span class="wd-l" aria-hidden="true">{LETTERS[i]}</span>
      </li>
    {/each}
  </ol>
  {#if best > 1}<p class="muted week-best">Meilleure série : {best} jours</p>{/if}
</div>
