<script lang="ts">
  let { current, onselect }: { current: string; onselect?: (view: string) => void } = $props();
  const links = [
    { view: 'accueil', label: 'Accueil', path: 'M11.3 2.7a1 1 0 0 1 1.4 0l8.6 8.1c.6.6.2 1.7-.7 1.7H19v7a1.5 1.5 0 0 1-1.5 1.5h-3a.5.5 0 0 1-.5-.5v-4.5a2 2 0 0 0-4 0v4.5a.5.5 0 0 1-.5.5h-3A1.5 1.5 0 0 1 5 19.5v-7H3.4c-.9 0-1.3-1.1-.7-1.7z' },
    { view: 'creer', label: 'Créer', path: 'M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5zm4 5a1.3 1.3 0 0 0-1.3 1.3v1.4H9.3a1.3 1.3 0 0 0 0 2.6h1.4v1.4a1.3 1.3 0 0 0 2.6 0v-1.4h1.4a1.3 1.3 0 0 0 0-2.6h-1.4V9.3A1.3 1.3 0 0 0 12 8z' },
    { view: 'progres', label: 'Progrès', path: 'M3 12h4.5v9H3zm6.75-5h4.5v14h-4.5zM16.5 3H21v18h-4.5z' },
    { view: 'bibliotheque', label: 'Bibliothèque', path: 'M4 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm6 0h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm6.6 1.2 2.9-.8a1 1 0 0 1 1.2.7l4 15.4a1 1 0 0 1-.7 1.2l-2.9.8a1 1 0 0 1-1.2-.7l-4-15.4a1 1 0 0 1 .7-1.2z' },
  ];
</script>

<nav class="nav" aria-label="Navigation principale">
  <div class="brand">
    <svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.5" /><path d="M12 7.5V21M5 13a7 7 0 0 0 14 0M8 11h8" /></g></svg>ancrage
  </div>
  {#each links as link (link.view)}
    <a href={`#${link.view}`} aria-current={current === link.view ? 'page' : undefined} onclick={() => onselect?.(link.view)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d={link.path} /></svg>{link.label}
    </a>
  {/each}
</nav>
