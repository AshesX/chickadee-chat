import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Outfit — modern geometric sans-serif font
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/900.css';

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
