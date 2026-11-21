import { defineConfig } from 'vite';

// base: './' keeps asset paths relative so the same build works when wrapped
// by Capacitor (mobile) or served from a sub-path (GitHub Pages, itch.io).
export default defineConfig({
  base: './',
  server: {
    // WSL: file events from Windows-side editors don't always reach Linux.
    // Polling is only needed if the project lives under /mnt/c.
    watch: { usePolling: process.env.VITE_POLL === '1' },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
