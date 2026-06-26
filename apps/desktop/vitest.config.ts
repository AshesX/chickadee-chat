import { defineConfig } from 'vitest/config';

// Standalone from electron.vite.config: these are pure-logic unit tests that need
// neither Electron nor the React plugin. Node environment; DOM-touching helpers
// stub the few globals they read (e.g. window.speechSynthesis) per test.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
