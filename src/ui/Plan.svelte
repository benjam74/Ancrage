<script lang="ts">
  import { dailyEventIcs } from '../core/ics';
  import { newId } from '../core/ids';
  import { prefs, updatePrefs } from './prefs.svelte';

  let editing = $state(false);
  let time = $state(prefs.plan?.time ?? '08:00');
  let cue = $state(prefs.plan?.cue ?? '');

  const hour = (t: string) => {
    const [h, m] = t.split(':');
    return m === '00' ? `${Number(h)} h` : `${Number(h)} h ${m}`;
  };

  function save(e: SubmitEvent) {
    e.preventDefault();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return;
    updatePrefs({ plan: { time, cue: cue.trim() } });
    editing = false;
  }

  function download() {
    if (!prefs.plan) return;
    const text = dailyEventIcs({ ...prefs.plan, now: Date.now(), uid: `${newId()}@ancrage` });
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ancrage-rendez-vous.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<section class="panel" aria-labelledby="plan-title">
  <h3 id="plan-title">Ton rendez-vous</h3>
  {#if prefs.plan && !editing}
    <p><b>Chaque jour à {hour(prefs.plan.time)}</b>{prefs.plan.cue ? `, ${prefs.plan.cue}` : ''}.</p>
    <div class="actions">
      <button class="btn small" onclick={download}>Ajouter à mon agenda</button>
      <button class="btn small ghost" onclick={() => (editing = true)}>Modifier</button>
      <button class="btn small ghost" onclick={() => updatePrefs({ plan: null })}>Retirer</button>
    </div>
  {:else}
    <p class="muted">Quand feras-tu ta manche ? Décider d’un moment précis aide beaucoup à tenir.</p>
    <form class="plan-form" onsubmit={save}>
      <div class="field time"><label for="plan-time">Heure</label><input id="plan-time" type="time" bind:value={time} required /></div>
      <div class="field"><label for="plan-cue">Moment</label><input id="plan-cue" bind:value={cue} maxlength="80" placeholder="Ex. après le café" /></div>
      <button class="btn small">Fixer le rendez-vous</button>
    </form>
  {/if}
</section>
