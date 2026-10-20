import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[UI render failure]', error, info.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <main className="crash-screen" role="alert">
          <div className="crash-card">
            <div className="crash-mark">!</div>
            <p className="crash-eyebrow">THE APP NEEDS A MOMENT</p>
            <h1>This screen ran into a problem.</h1>
            <p className="crash-message">
              Your saved searches and job data are still stored on this device. Reload the app to try again.
            </p>
            <details className="crash-details">
              <summary>Technical details</summary>
              <pre>{this.state.error.message}</pre>
            </details>
            <button className="crash-reload" onClick={() => window.location.reload()}>
              Reload app
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
