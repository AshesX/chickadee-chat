import { defineConfig } from 'vitest/config';

// Standalone from electron.vite.config: these are pure-logic unit tests that need
// neither Electron nor the React plugin. Node environment; DOM-touching helpers
// stub the few globals they read (e.g. window.speechSynthesis) per test.
export default defineConfig({
  test: {
    // Default env is node (fast) for pure-logic tests; hook/component tests opt
    // into jsdom per-file with a top-of-file `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
