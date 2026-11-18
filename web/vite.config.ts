import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The app ships as one classic script (IIFE) and one stylesheet so a generated site also works when
// opened straight from disk (file://), where module scripts and fetch() are blocked.
export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: false,
    // Inline the two variable fonts into the stylesheet: no extra requests, works offline.
    assetsInlineLimit: 400_000,
    sourcemap: false,
    lib: {
      entry: 'src/main.tsx',
      name: 'Lineum',
      formats: ['iife'],
      fileName: () => 'lineum.js',
      cssFileName: 'lineum',
    },
  },
});
