import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // A fixed zone with a DST change, so day arithmetic is tested the same way everywhere.
    env: { TZ: 'Europe/Paris' },
  },
});
