<script lang="ts">
  import type { Services } from '../app/services';
  import { whyOf } from '../app/services';
  import { currentProfile, profileStore } from '../app/current';
  import { describeNote } from '../core/generate';
  import { EXPLAIN_BATCH } from '../core/explain';
  import type { Note, Theme } from '../core/model';

  /** Completes the missing explanations of a theme with Claude; nothing is saved before the learner checks them. */
  let { services, theme, notes, ondone }: { services: Services; theme: Theme; notes: Note[]; ondone: (saved: number) => void } = $props();

  const apiKey = profileStore().get('ancrage.ai.key')?.trim() ?? '';
  const missing = $derived(notes.filter((n) => !whyOf(n)));
  type Row = { note: Note; text: string; keep: boolean };
  let rows = $state<Row[]>([]);
  let busy = $state(false);
  let progress = $state('');
  let error = $state('');

  async function run() {
    if (busy) return;
    busy = true;
    error = '';
    rows = [];
    try {
      const { createAiClient, explainNotes } = await import('../app/ai');
      const client = createAiClient(apiKey);
      const found: Row[] = [];
      for (let i = 0; i < missing.length; i += EXPLAIN_BATCH) {
        const batch = missing.slice(i, i + EXPLAIN_BATCH);
        progress = missing.length > EXPLAIN_BATCH ? `Cartes ${i + 1} à ${i + batch.length} sur ${missing.length}…` : '';
        const res = await explainNotes(client, batch.map((n) => ({ id: n.id, text: describeNote(n.fields) })), currentProfile.audience);
        if (!res.ok) {
          error = res.error;
          break;
        }
        for (const n of batch) {
          const text = res.explanations.get(n.id);
          if (text) found.push({ note: n, text, keep: true });
        }
      }
      rows = found;
      if (!found.length && !error) error = 'Aucune explication proposée. Réessaie.';
    } finally {
      busy = false;
      progress = '';
    }
  }

  async function save() {
    if (busy) return;
    busy = true;
    let saved = 0;
    try {
      for (const r of rows) {
        if (!r.keep || !r.text.trim()) continue;
        await services.setExplanation(r.note.id, r.text, Date.now());
        saved++;
      }
    } finally {
      busy = false;
    }
    rows = [];
    ondone(saved);
  }

  const label = (n: Note) => describeNote(n.fields).split('\n')[0];
</script>

{#if apiKey && missing.length && !rows.length}
  <button class="btn small ghost" disabled={busy} onclick={run}>{busy ? progress || 'Claude rédige…' : `Compléter les explications (${missing.length})`}</button>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
{/if}
{#if rows.length}
  <div class="explain-review" role="group" aria-label="Explications proposées pour « {theme.name} »">
    <p class="muted">Relis chaque explication : Claude n’a que la carte sous les yeux et peut se tromper. Décoche celles à ne pas garder.</p>
    {#each rows as r, i (r.note.id)}
      <div class="explain-row">
        <label class="check"><input type="checkbox" bind:checked={rows[i].keep} /><span class="summary">{label(r.note)}</span></label>
        <textarea class="ta" aria-label="Explication de « {label(r.note)} »" bind:value={rows[i].text} disabled={!r.keep}></textarea>
      </div>
    {/each}
    <div class="actions">
      <button class="btn small" disabled={busy} onclick={save}>Enregistrer les explications cochées ({rows.filter((r) => r.keep && r.text.trim()).length})</button>
      <button class="btn small ghost" onclick={() => (rows = [])}>Annuler</button>
    </div>
  </div>
{/if}
