import { defineConfig } from 'vite';

// Relative base so the build works at any path, including a GitHub Pages project URL.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 800 },
});
