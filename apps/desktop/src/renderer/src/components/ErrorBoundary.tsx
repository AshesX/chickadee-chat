import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches uncaught renderer errors and shows the message instead of letting
 * React unmount the whole tree into a silent blank window.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Renderer error boundary caught:', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash">
        <h1 className="crash__title">Something went wrong</h1>
        <pre className="crash__message">{error.message}</pre>
        <button className="btn btn--primary" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}
