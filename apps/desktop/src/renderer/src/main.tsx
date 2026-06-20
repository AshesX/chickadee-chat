import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/800.css';
// Space Grotesk — neo-grotesque used by the app's Editorial themes (Dark + Light).
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initRendererProfiler } from './lib/profiler';
import './theme.css';
import './styles.css';

// Start the rAF-rate profiler before React mounts, outside StrictMode, so it
// runs once (not double-invoked) and only when CHICKADEE_PROFILE is set.
initRendererProfiler();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
