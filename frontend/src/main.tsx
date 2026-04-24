import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './App.css'
import { ErrorBoundary } from './components/ErrorBoundary'
import { logClientError } from './utils/observability'

function showGlobalError(message: string) {
  try {
    let el = document.getElementById('app-error-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'app-error-overlay';
      Object.assign(el.style as any, {
        position: 'fixed',
        zIndex: 10000,
        left: 0,
        right: 0,
        top: 0,
        backgroundColor: 'rgba(220, 38, 38, 0.95)',
        color: '#fff',
        padding: '12px 8px',
        fontSize: '14px',
        textAlign: 'center',
      });
      document.body.appendChild(el);
    }
    el.textContent = message;
  } catch (e) {
    // ignore
  }
}

window.addEventListener('error', (ev) => {
  // Show a visible overlay for errors that escape React boundaries
  logClientError({
    area: 'window-runtime',
    action: 'window-error',
    message: 'Global window error event',
    context: { filename: ev.filename, lineno: ev.lineno, colno: ev.colno },
    error: ev.error || ev.message,
  });
  showGlobalError('Se produjo un error inesperado. Revisa la consola para más detalles.');
});

window.addEventListener('unhandledrejection', (ev) => {
  logClientError({
    area: 'window-runtime',
    action: 'unhandled-rejection',
    message: 'Unhandled promise rejection event',
    error: ev.reason,
  });
  showGlobalError('Se produjo un error (rejection). Revisa la consola para más detalles.');
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
