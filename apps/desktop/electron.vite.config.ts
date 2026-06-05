import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    // Bundle the workspace shared package (its entry is .ts) instead of
    // externalizing it, so main can import runtime values (ICE servers).
    plugins: [externalizeDepsPlugin({ exclude: ['@chickadee/shared'] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@chickadee/shared'] })],
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
      },
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
    plugins: [react()],
  },
});
