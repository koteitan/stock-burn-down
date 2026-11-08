import { Component, type ReactNode } from 'react';
import i18n from '../i18n';

/** Shows a render error instead of leaving a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return (
      <main className="crash" role="alert">
        <h1>{i18n.t('crash.title')}</h1>
        <pre>{message}</pre>
        <button onClick={() => window.location.reload()}>{i18n.t('crash.reload')}</button>
      </main>
    );
  }
}
