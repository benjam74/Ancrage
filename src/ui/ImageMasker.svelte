<script lang="ts">
  import { MIN_ZONE } from '../core/validate';
  import { parseMasks } from '../core/draft';
  import type { Mask } from '../core/model';

  /** Zone editor: `image` is a data URL, `masks` the zones as JSON (the draft's format). */
  let { image = $bindable(), masks = $bindable(), imageError = '', masksError = '' }: { image: string; masks: string; imageError?: string; masksError?: string } = $props();

  const MAX_SIDE = 1280;
  const MAX_BYTES = 700_000;
  const zones = $derived(parseMasks(masks));
  let reading = $state(false);
  let loadError = $state('');
  let frame: HTMLDivElement | undefined = $state();
  /** Zone being drawn or moved, in image fractions. */
  /** On touch screens a swipe scrolls the page; drawing needs this mode, so no zone is drawn by accident. */
  let drawMode = $state(false);
  let announce = $state('');
  let drag = $state<{ mode: 'draw' | 'move'; id?: string; x0: number; y0: number; start?: Mask; rect: Mask } | null>(null);

  const set = (list: Mask[]) => (masks = JSON.stringify(list));
  const nextId = () => `z${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

  /** Decoded by an <img> (works everywhere, respects photo orientation), drawn small, canvases freed at once. */
  async function compress(file: File): Promise<string> {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      try {
        await img.decode();
      } catch {
        throw new Error('format');
      }
      for (const [side, quality] of [[MAX_SIDE, 0.8], [1000, 0.65], [800, 0.55]] as const) {
        const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d')!;
        // Transparent schemas (PNG) stay readable once flattened.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let out = canvas.toDataURL('image/webp', quality);
        if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/jpeg', quality);
        // iOS caps the memory of all canvases together.
        canvas.width = canvas.height = 0;
        if (out.length * 0.75 <= MAX_BYTES) return out;
      }
      throw new Error('size');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    // Zones are placed on the picture: a new picture starts without them.
    if (zones.length && !confirm(`Changer d’image efface les ${zones.length} zones tracées. Continuer ?`)) return;
    reading = true;
    loadError = '';
    try {
      image = await compress(file);
      set([]);
    } catch (e) {
      loadError = (e as Error).message === 'format'
        ? 'Format d’image non reconnu (photo HEIC ?). Choisis une image JPEG ou PNG, ou une capture d’écran.'
        : 'Image trop lourde, même réduite. Essaie une capture d’écran ou une photo plus petite.';
    } finally {
      reading = false;
    }
  }

  function at(e: PointerEvent) {
    const r = frame!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  }

  /** Touch draws only in drawing mode (else it scrolls); touch zones must be a bit larger than a slip. */
  const touchOff = (e: PointerEvent) => e.pointerType === 'touch' && !drawMode;
  let minSide = MIN_ZONE;

  function down(e: PointerEvent) {
    if (!frame || e.button !== 0 || touchOff(e)) return;
    minSide = e.pointerType === 'touch' ? 0.04 : MIN_ZONE;
    const p = at(e);
    const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-zone]')?.dataset.zone;
    const zone = hit ? zones.find((z) => z.id === hit) : undefined;
    frame.setPointerCapture(e.pointerId);
    drag = zone
      ? { mode: 'move', id: zone.id, x0: p.x, y0: p.y, start: zone, rect: zone }
      : { mode: 'draw', x0: p.x, y0: p.y, rect: { id: nextId(), x: p.x, y: p.y, w: 0, h: 0, label: '' } };
    e.preventDefault();
  }

  function move(e: PointerEvent) {
    if (!drag) return;
    const p = at(e);
    if (drag.mode === 'draw') {
      drag.rect = { ...drag.rect, x: Math.min(p.x, drag.x0), y: Math.min(p.y, drag.y0), w: Math.abs(p.x - drag.x0), h: Math.abs(p.y - drag.y0) };
    } else if (drag.start) {
      const s = drag.start;
      drag.rect = { ...s, x: clamp(s.x + p.x - drag.x0, 0, 1 - s.w), y: clamp(s.y + p.y - drag.y0, 0, 1 - s.h) };
    }
  }

  function up() {
    if (!drag) return;
    const r = drag.rect;
    if (drag.mode === 'draw' && r.w >= minSide && r.h >= minSide) set([...zones, r]);
    if (drag.mode === 'move') set(zones.map((z) => (z.id === r.id ? r : z)));
    drag = null;
  }

  /** Keyboard and small screens: a zone in the middle, to drag or nudge into place. */
  function addZone() {
    const n = zones.length % 5;
    set([...zones, { id: nextId(), x: 0.35 + n * 0.03, y: 0.4 + n * 0.03, w: 0.25, h: 0.1, label: '' }]);
  }

  function nudge(id: string, dx: number, dy: number, grow = false) {
    const list = zones.map((z) => {
      if (z.id !== id) return z;
      if (grow) {
        const w = clamp(z.w + dx, MIN_ZONE, 1 - z.x);
        const h = clamp(z.h + dy, MIN_ZONE, 1 - z.y);
        return { ...z, w, h };
      }
      return { ...z, x: clamp(z.x + dx, 0, 1 - z.w), y: clamp(z.y + dy, 0, 1 - z.h) };
    });
    set(list);
    const i = list.findIndex((z) => z.id === id);
    const z = list[i];
    const pc = (v: number) => Math.round(v * 100);
    announce = `Zone ${i + 1} : à ${pc(z.x)} % de la gauche et ${pc(z.y)} % du haut, ${pc(z.w)} × ${pc(z.h)} %.`;
  }

  function key(e: KeyboardEvent, id: string) {
    const step = e.altKey ? 0.005 : 0.02;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (!d[e.key]) return;
    e.preventDefault();
    nudge(id, d[e.key][0], d[e.key][1], e.shiftKey);
  }

  const setLabel = (id: string, label: string) => set(zones.map((z) => (z.id === id ? { ...z, label } : z)));
  const remove = (id: string) => set(zones.filter((z) => z.id !== id));
  // The zone being moved keeps its place (and number); a zone being drawn comes last.
  const shown = $derived(!drag ? zones : drag.mode === 'move' ? zones.map((z) => (z.id === drag!.rect.id ? drag!.rect : z)) : [...zones, drag.rect]);
</script>

<div class="field" class:invalid={!!imageError || !!loadError}>
  <span class="label-like" id="img-label">Image</span>
  <label class="btn small ghost file-btn" class:disabled={reading}>
    {reading ? 'Préparation…' : image ? 'Changer d’image' : 'Choisir une image'}
    <input type="file" accept="image/*" aria-labelledby="img-label" aria-describedby="img-hint" onchange={pick} disabled={reading} />
  </label>
  <span id="img-hint" class={imageError || loadError ? 'error' : 'hint'}>{loadError || imageError || 'Photo, capture ou schéma. L’image est réduite pour rester légère.'}</span>
</div>

{#if image}
  <div class="field" class:invalid={!!masksError}>
    <span class="label-like">Zones à masquer</span>
    <p class="hint">Trace un rectangle sur chaque partie à retrouver (étiquette, nom, chiffre). Fais glisser une zone pour la déplacer. Sur un écran tactile, active d’abord « Tracer au doigt ».</p>
    <button type="button" class="btn small ghost touch-draw" aria-pressed={drawMode} onclick={() => (drawMode = !drawMode)}>{drawMode ? 'Tracé au doigt activé' : 'Tracer au doigt'}</button>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="masker" class:drawing={drawMode} bind:this={frame} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={() => (drag = null)}>
      <img src={image} alt="Schéma à légender" draggable="false" />
      {#each shown as z, i (z.id)}
        <div class="zone edit" data-zone={z.id} style="left:{z.x * 100}%;top:{z.y * 100}%;width:{z.w * 100}%;height:{z.h * 100}%"><span>{i + 1}</span></div>
      {/each}
    </div>
    <button type="button" class="btn small ghost" style="justify-self:start" onclick={addZone}>Ajouter une zone au centre</button>
    {#if zones.length}
      <ol class="zone-list">
        {#each zones as z, i (z.id)}
          <li>
            <span class="zone-n" aria-hidden="true">{i + 1}</span>
            <input class="inline-input" aria-label="Réponse de la zone {i + 1}" value={z.label} placeholder="Ce que cache la zone (facultatif)" oninput={(e) => setLabel(z.id, e.currentTarget.value)} />
            <button type="button" class="btn small ghost" aria-label="Placer la zone {i + 1} au clavier (flèches, Maj pour agrandir)" onkeydown={(e) => key(e, z.id)}>Placer</button>
            <button type="button" class="btn small ghost" aria-label="Supprimer la zone {i + 1}" onclick={() => remove(z.id)}>Supprimer</button>
          </li>
        {/each}
      </ol>
      <p class="sr" aria-live="polite">{announce}</p>
      <p class="hint">Une zone sans réponse se révise en t’auto-évaluant. Au clavier : « Placer », puis les flèches (Maj + flèches pour agrandir).</p>
    {/if}
    <span class={masksError ? 'error' : 'hint'} role={masksError ? 'alert' : undefined}>{masksError || `${zones.length} zone${zones.length > 1 ? 's' : ''}, donc ${zones.length} carte${zones.length > 1 ? 's' : ''}.`}</span>
  </div>
{/if}
