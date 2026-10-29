<script lang="ts">
  import type { CloudSync } from '../app/cloud';
  import type { Services } from '../app/services';
  import SyncSettings from './SyncSettings.svelte';
  import { prefs, updatePrefs } from './prefs.svelte';
  import { parseBackup, summarize, type Dump } from '../core/backup';
  import { RETENTION_MAX, RETENTION_MIN } from '../core/settings';

  let { services, cloud, onchange }: { services: Services; cloud: CloudSync; onchange: () => void } = $props();

  // bind:value on a range input yields a number.
  let retention = $state<number>(0.9);
  let newPerDay = $state('5');
  let errors = $state<{ desiredRetention?: string; newPerDay?: string }>({});
  let saved = $state('');
  let persisted = $state<boolean | null>(null);
  // Raw state: IndexedDB cannot clone Svelte's reactive proxies (DataCloneError).
  let pending = $state.raw<{ dump: Dump; exportedAt: number; name: string } | null>(null);
  let importError = $state('');
  let status = $state('');

  const fr = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function load() {
    const s = await services.repo.getSettings();
    retention = s.desiredRetention;
    newPerDay = String(s.newPerDay);
    try {
      persisted = (await navigator.storage?.persisted?.()) ?? null;
    } catch {
      persisted = null;
    }
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    saved = '';
    const res = await services.updateSettings({ desiredRetention: retention, newPerDay });
    errors = res.ok ? {} : res.errors;
    if (res.ok) {
      saved = 'Réglages enregistrés.';
      onchange();
    }
  }

  async function download() {
    const { fileName, text } = await services.exportBackup(Date.now());
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Safari needs the URL a little longer than the click.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status = `Sauvegarde « ${fileName} » créée.`;
  }

  async function pick(e: Event) {
    importError = '';
    status = '';
    pending = null;
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    const res = parseBackup(await file.text());
    if (res.ok) pending = { dump: res.dump, exportedAt: res.exportedAt, name: file.name };
    else importError = res.error;
  }

  async function apply(mode: 'merge' | 'replace') {
    if (!pending) return;
    try {
      if (mode === 'merge') await services.mergeBackup(pending.dump);
      else await services.importBackup(pending.dump);
      status = mode === 'merge' ? 'Sauvegarde fusionnée avec tes données.' : 'Données restaurées.';
      pending = null;
      onchange();
      await load();
    } catch (err) {
      console.error('Restore failed', err);
      importError = mode === 'merge' ? 'La fusion a échoué, tes données n’ont pas été modifiées.' : 'La restauration a échoué, tes données n’ont pas été modifiées.';
    }
  }

  load();
</script>

<main class="page">
  <header>
    <p class="eyebrow">Application</p>
    <h1>Réglages</h1>
  </header>

  <form class="panel" onsubmit={save} novalidate>
    <h2>Planification</h2>
    <div class="field" class:invalid={!!errors.desiredRetention}>
      <label for="s-retention">Rétention visée : {fr(+retention)}</label>
      <input id="s-retention" type="range" min={RETENTION_MIN} max={RETENTION_MAX} step="0.01" bind:value={retention} aria-valuetext={fr(+retention)} aria-invalid={!!errors.desiredRetention} aria-describedby="s-retention-msg" />
      <span id="s-retention-msg" class={errors.desiredRetention ? 'error' : 'hint'}>
        {errors.desiredRetention ?? 'Probabilité de te souvenir d’une carte quand elle revient. Plus haut : plus de révisions, intervalles plus courts. 0,90 convient à la plupart des gens. Changer ce réglage recalcule tout ton historique, y compris l’XP passée.'}
      </span>
    </div>
    <div class="field" class:invalid={!!errors.newPerDay}>
      <label for="s-new">Nouvelles cartes par jour</label>
      <input id="s-new" inputmode="numeric" bind:value={newPerDay} aria-invalid={!!errors.newPerDay} aria-describedby="s-new-msg" style="max-width:8em" />
      <span id="s-new-msg" class={errors.newPerDay ? 'error' : 'hint'}>{errors.newPerDay ?? 'Jusqu’à 200. Mets 0 pour faire une pause. Pour en apprendre plus un jour donné : Accueil → Choisir quoi réviser.'}</span>
    </div>
    <div class="row">
      <span role="status" class="muted">{saved}</span>
      <button class="btn">Enregistrer</button>
    </div>
  </form>

  <section class="panel prefs" aria-labelledby="s-motivation">
    <h2 id="s-motivation">Motivation</h2>
    <p class="muted">Réglages de cet appareil.</p>
    <div class="field">
      <label for="s-goal">Objectif du jour</label>
      <select id="s-goal" value={String(prefs.dailyRounds)} onchange={(e) => updatePrefs({ dailyRounds: Number(e.currentTarget.value) as 1 | 2 | 3 })} style="max-width:14em">
        <option value="1">1 manche (10 cartes)</option>
        <option value="2">2 manches (20 cartes)</option>
        <option value="3">3 manches (30 cartes)</option>
      </select>
      <span class="hint">Ta série tient avec une seule manche, quel que soit l’objectif.</span>
    </div>
    <label class="check"><input type="checkbox" checked={prefs.sound} onchange={(e) => updatePrefs({ sound: e.currentTarget.checked })} />Sons</label>
    <label class="check"><input type="checkbox" checked={prefs.haptics} onchange={(e) => updatePrefs({ haptics: e.currentTarget.checked })} />Vibrations (sur les téléphones qui le permettent)</label>
    <label class="check"><input type="checkbox" checked={prefs.motion} onchange={(e) => updatePrefs({ motion: e.currentTarget.checked })} />Animations</label>
    <label class="check"><input type="checkbox" checked={prefs.showStreak} onchange={(e) => updatePrefs({ showStreak: e.currentTarget.checked })} />Afficher la série</label>
  </section>

  <SyncSettings {cloud} onsynced={async () => { onchange(); await load(); }} />

  <section class="panel">
    <h2>Sauvegarde</h2>
    <p>Tes données restent sur cet appareil. Télécharge une sauvegarde régulièrement : elle contient tes thèmes, tes notes et tout ton historique.</p>
    <p class="muted">
      {persisted === true ? 'Le navigateur a accepté de conserver tes données.' : persisted === false ? 'Le navigateur peut effacer tes données s’il manque de place : la sauvegarde est ta protection.' : ''}
    </p>
    <div class="actions">
      <button class="btn" onclick={download}>Télécharger une sauvegarde</button>
    </div>

    <div class="field">
      <label for="s-import">Ouvrir une sauvegarde</label>
      <span class="hint">Pour passer d’un appareil à l’autre sans compte : exporte ici, ouvre le fichier sur l’autre appareil et choisis « Fusionner ».</span>
      <input id="s-import" type="file" accept="application/json,.json" onchange={pick} />
      {#if importError}<span class="error" role="alert">{importError}</span>{/if}
    </div>
    {#if pending}
      {@const sum = summarize(pending.dump)}
      <div class="confirm" style="color:inherit">
        <span>
          « {pending.name} » : {sum.themes} thème{sum.themes > 1 ? 's' : ''}, {sum.notes} note{sum.notes > 1 ? 's' : ''}, {sum.reviews} révision{sum.reviews > 1 ? 's' : ''}{pending.exportedAt ? `, exportée le ${new Date(pending.exportedAt).toLocaleDateString('fr-FR')}` : ''}.
          « Fusionner » ajoute ce qui manque et garde la version la plus récente de chaque note. « Remplacer » efface d’abord les données de cet appareil ; si la synchronisation est active, la prochaine synchronisation y rajoutera la copie du serveur.
        </span>
        <button class="btn small" onclick={() => apply('merge')}>Fusionner avec mes données</button>
        <button class="btn small danger" onclick={() => apply('replace')}>Remplacer mes données</button>
        <button class="btn small ghost" onclick={() => (pending = null)}>Annuler</button>
      </div>
    {/if}
    <p role="status" class="muted">{status}</p>
  </section>
</main>
