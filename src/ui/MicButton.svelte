<script lang="ts">
  import type { Lang } from '../core/model';
  import { canDictate, dictate } from './voice';

  /** Dictates one phrase and hands it over; hidden where the browser cannot dictate. */
  let { lang, disabled = false, onheard }: { lang: Lang; disabled?: boolean; onheard: (text: string) => void } = $props();
  let listening = $state(false);
  let error = $state('');
  let stop: (() => void) | null = null;

  async function toggle() {
    if (listening) return stop?.();
    error = '';
    listening = true;
    const session = dictate(lang);
    stop = session.stop;
    try {
      onheard(await session.done);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      listening = false;
      stop = null;
    }
  }
</script>

{#if canDictate()}
  <span class="mic-wrap">
    <button type="button" class="icon-btn mic" class:on={listening} aria-pressed={listening} aria-label={listening ? 'Arrêter la dictée' : 'Dicter ma réponse'} {disabled} onclick={toggle}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
    </button>
    {#if error}<span class="hint error" role="alert">{error}</span>{/if}
  </span>
{/if}
