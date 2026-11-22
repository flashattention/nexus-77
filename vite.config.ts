import { defineConfig, type Plugin } from 'vite';

/**
 * The bundled fonts list a .woff fallback after each .woff2; every browser and
 * WebView we target reads woff2, so the fallbacks are dropped from the build.
 */
function dropWoffFallback(): Plugin {
  return {
    name: 'drop-woff-fallback',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      for (const [name, asset] of Object.entries(bundle)) {
        if (name.endsWith('.woff')) { delete bundle[name]; continue; }
        if (asset.type === 'asset' && name.endsWith('.css') && typeof asset.source === 'string') {
          asset.source = asset.source.replace(/,\s*url\([^)]+\.woff\)\s*format\(["']woff["']\)/g, '');
        }
      }
    },
  };
}

// base: './' keeps asset paths relative so the same build works when wrapped
// by Capacitor (mobile) or served from a sub-path (GitHub Pages, itch.io).
export default defineConfig({
  base: './',
  plugins: [dropWoffFallback()],
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
