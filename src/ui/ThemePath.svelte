<script lang="ts">
  import type { ThemeProgress } from '../app/services';
  import { LEVEL_COLORS } from './levels';

  let { themes, onstart }: { themes: ThemeProgress[]; onstart: () => void } = $props();
  const R = 35;
  const C = 2 * Math.PI * R;
  // Active node: the theme closest to its next level, themes already started first.
  const activeId = $derived(
    [...themes]
      .filter((t) => t.cards > 0 && t.next)
      .sort((a, b) => Number(a.level === 'Nouveau') - Number(b.level === 'Nouveau') || a.next!.remaining - b.next!.remaining)[0]?.theme.id,
  );
  const nextText = (t: ThemeProgress) =>
    !t.next ? '' : t.level === 'Nouveau' ? 'Commence pour découvrir' : `Plus que ${t.next.remaining} carte${t.next.remaining > 1 ? 's' : ''} pour ${t.next.level}`;
  let open = $state<string | null>(null);
  const selected = $derived(themes.find((t) => t.theme.id === (open ?? activeId)));
</script>

<div class="path">
  {#each themes as t (t.theme.id)}
    {@const [c, cd, ci] = LEVEL_COLORS[t.level]}
    <div class="node-row">
      <button
        class="node"
        class:active={t.theme.id === activeId}
        style="--c:var({c});--cd:var({cd});--ci:var({ci})"
        aria-label="{t.theme.name}, {t.level}, {t.mastery} % maîtrisé"
        aria-expanded={selected?.theme.id === t.theme.id}
        onclick={() => (open = t.theme.id)}
      >
        <span class="disc">
          <svg class="lvl" viewBox="0 0 78 78" aria-hidden="true">
            <circle cx="39" cy="39" r={R} style="stroke:var(--surface-2)" />
            <circle cx="39" cy="39" r={R} style="stroke:var({c});stroke-linecap:round;transform:rotate(-90deg);transform-origin:50% 50%" stroke-dasharray={C} stroke-dashoffset={C * (1 - t.mastery / 100)} />
          </svg>
          <span class="core" aria-hidden="true">{t.theme.name.trim().charAt(0).toUpperCase()}</span>
        </span>
        <span class="name">{t.theme.name}</span>
        <span class="lvl-label">{t.level} · {t.mastery} %</span>
        {#if t.theme.id === activeId && nextText(t)}<span class="lvl-label next">{nextText(t)}</span>{/if}
      </button>
    </div>
  {/each}
</div>

{#if selected}
  {@const [c] = LEVEL_COLORS[selected.level]}
  <div class="panel" aria-live="polite">
    <div class="row"><h3>{selected.theme.name}</h3><span class="pill">{selected.level}</span></div>
    <div class="bar" style="--c:var({c})"><i style="width:{selected.mastery}%"></i></div>
    <p class="muted">{selected.mastery} % maîtrisé · {selected.cards} carte{selected.cards > 1 ? 's' : ''} · {selected.due} à réviser aujourd’hui</p>
    {#if selected.next && selected.level !== 'Nouveau'}
      <p><b>{nextText(selected)}.</b> Une carte compte comme maîtrisée quand elle tient au moins 3 semaines.</p>
    {/if}
    {#if selected.cards === 0}
      <a class="btn ghost" href="#creer">Créer les premières cartes</a>
    {:else if selected.due > 0}
      <button class="btn ghost" onclick={onstart}>Commencer la séance</button>
    {/if}
  </div>
{/if}
