<script lang="ts">
  import type { CharacterId, Slot } from '../core/model';
  import { ART, PYJAMA_BOTTOM, PYJAMA_TOP, SPECIES, ankles, companion, feet, hands, head } from '../data/art';

  let {
    character,
    outfit = {},
    decor = false,
    label = '',
    pose = 'idle',
  }: {
    character: CharacterId;
    outfit?: Partial<Record<Slot, string>>;
    /** Draw the background scene (shop and round end only). */
    decor?: boolean;
    label?: string;
    pose?: 'idle' | 'walk' | 'jump';
  } = $props();

  const art = (slot: Slot) => (outfit[slot] ? (ART[outfit[slot]!]?.svg ?? '') : '');
  const svg = $derived.by(() => {
    const sp = SPECIES[character];
    return [
      decor ? art('decor') : '',
      feet(sp),
      ankles(sp),
      art('bas') || PYJAMA_BOTTOM,
      art('haut') || PYJAMA_TOP,
      hands(sp),
      art('cou'),
      head(sp),
      art('lunettes'),
      art('chapeau'),
      art('objet'),
      companion(art('compagnon')),
    ].join('');
  });
</script>

<svg class="avatar-svg {pose}" viewBox="0 -14 120 174" role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : 'true'}>
  <g class="avatar-body">{@html svg}</g>
</svg>
