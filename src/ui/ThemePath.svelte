<script lang="ts">
  import type { ThemeProgress } from '../app/services';
  import { untrack } from 'svelte';
  import type { CharacterId, Slot } from '../core/model';
  import Avatar from './Avatar.svelte';
  import { LEVEL_COLORS, activeTheme, nextText } from './levels';
  import { motionOn, prefs, updatePrefs } from './prefs.svelte';

  let {
    themes,
    onstart,
    onpick,
    look = null,
  }: {
    themes: ThemeProgress[];
    onstart: () => void;
    onpick: (themeId: string) => void;
    /** The learner's character, standing on the current chapter. */
    look?: { character: CharacterId; outfit: Partial<Record<Slot, string>>; name: string } | null;
  } = $props();
  let walker = $state<HTMLElement | null>(null);
  let pose = $state<'idle' | 'walk' | 'jump'>('idle');

  // When the current chapter changed since the last visit, the character walks there from the previous one.
  $effect(() => {
    const id = activeId;
    const el = walker;
    if (!id || !el) return;
    const from = untrack(() => prefs.lastChapter);
    if (from === id) return;
    untrack(() => updatePrefs({ lastChapter: id }));
    const start = from ? [...document.querySelectorAll<HTMLElement>('[data-theme]')].find((n) => n.dataset.theme === from)?.querySelector<HTMLElement>('.disc') : null;
    const end = el.closest('.node')?.querySelector<HTMLElement>('.disc');
    if (!start || !end || !motionOn() || typeof el.animate !== 'function') return;
    const a = start.getBoundingClientRect();
    const b = end.getBoundingClientRect();
    pose = 'walk';
    const run = el.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'none' }], { duration: 900, easing: 'ease-in-out' });
    run.onfinish = () => (pose = 'jump');
  });
  const R = 35;
  const C = 2 * Math.PI * R;
  const activeId = $derived(activeTheme(themes)?.theme.id);
  let open = $state<string | null>(null);
  const selected = $derived(themes.find((t) => t.theme.id === (open ?? activeId)));
  /** Chance of remembering, as a whole percentage. */
  const pct = (p: number) => `${Math.round(p * 100)} %`;
</script>

<div class="path">
  {#each themes as t (t.theme.id)}
    {@const [c, cd, ci] = LEVEL_COLORS[t.level]}
    <div class="node-row">
      <button
        data-theme={t.theme.id}
        class="node"
        class:active={t.theme.id === activeId}
        style="--c:var({c});--cd:var({cd});--ci:var({ci})"
        aria-label="{t.theme.name}, {t.level}, {t.mastery} % maîtrisé"
        aria-expanded={selected?.theme.id === t.theme.id}
        onclick={() => (open = t.theme.id)}
      >
        {#if look && t.theme.id === activeId}
          <span class="walker" bind:this={walker}><Avatar character={look.character} outfit={look.outfit} {pose} /></span>
        {/if}
        <span class="disc">
          <svg class="lvl" viewBox="0 0 78 78" aria-hidden="true">
            <circle cx="39" cy="39" r={R} style="stroke:var(--surface-2)" />
            <circle cx="39" cy="39" r={R} style="stroke:var({c});stroke-linecap:round;transform:rotate(-90deg);transform-origin:50% 50%" stroke-dasharray={C} stroke-dashoffset={C * (1 - t.mastery / 100)} />
          </svg>
          <span class="core" aria-hidden="true">{t.theme.name.trim().charAt(0).toUpperCase()}</span>
        </span>
        <span class="name">{t.theme.name}</span>
        <span class="lvl-label">{t.level} · {t.mastery} %</span>
        {#if t.level !== 'Nouveau' || t.theme.id === activeId}{#if nextText(t)}<span class="lvl-label next">{nextText(t)}</span>{/if}{/if}
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
    {#if selected.memory}
      <p class="memory-line">Mémoire actuelle : <b>{pct(selected.memory.now)}</b> · dans 30 jours sans réviser : <b>{pct(selected.memory.in30)}</b></p>
    {/if}
    {#if selected.cards === 0}
      <a class="btn ghost" href="#creer">Créer les premières cartes</a>
    {:else}
      <div class="actions">
        <button class="btn small" onclick={() => onpick(selected.theme.id)}>Réviser ce thème</button>
        {#if selected.due > 0}<button class="btn small ghost" onclick={onstart}>Séance du jour</button>{/if}
      </div>
    {/if}
  </div>
{/if}
