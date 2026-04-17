import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './App.css'
import { ErrorBoundary } from './components/ErrorBoundary'

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
  // eslint-disable-next-line no-console
  console.error('Global window error:', ev.error || ev.message, ev);
  showGlobalError('Se produjo un error inesperado. Revisa la consola para más detalles.');
});

window.addEventListener('unhandledrejection', (ev) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled promise rejection:', ev.reason);
  showGlobalError('Se produjo un error (rejection). Revisa la consola para más detalles.');
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
