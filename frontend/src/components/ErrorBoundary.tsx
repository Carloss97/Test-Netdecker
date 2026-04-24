import React from 'react';
import { logClientError } from '../utils/observability';

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error?: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logClientError({
      area: 'react-error-boundary',
      action: 'component-did-catch',
      message: 'Unhandled render error captured by ErrorBoundary',
      context: { componentStack: info.componentStack },
      error,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20 }}>
          <h2>Se produjo un error inesperado</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error?.message}</pre>
          <div style={{ marginTop: 12 }}>
            <button onClick={() => window.location.reload()}>Recargar</button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
