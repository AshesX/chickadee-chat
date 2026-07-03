import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Geist — neutral, modern neo-grotesque used by the app's "Alabaster Editorial" theme.
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/700.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/900.css';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './theme.css';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
