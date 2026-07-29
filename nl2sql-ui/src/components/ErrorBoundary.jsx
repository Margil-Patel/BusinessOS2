import React from 'react';

/**
 * ErrorBoundary
 * Catches JavaScript errors anywhere in child component tree,
 * logs those errors, and displays a fallback UI instead of crashing to a blank page.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught UI Error caught by ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', padding: 48, background: '#0d1117', color: 'var(--text-primary)', textAlign: 'center', gap: 16
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', background: 'rgba(248,81,73,0.1)',
            border: '1px solid rgba(248,81,73,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f85149" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#f85149', margin: 0 }}>
            Something went wrong in this view
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: 460, wordBreak: 'break-word', fontFamily: 'var(--font-mono)' }}>
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </div>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              if (this.props.onReset) {
                this.props.onReset();
              } else {
                window.history.pushState(null, '', '/chat');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }
            }}
            style={{
              padding: '8px 20px', borderRadius: 6, background: 'rgba(47,129,247,0.15)',
              border: '1px solid rgba(47,129,247,0.4)', color: 'var(--accent)', fontSize: '0.85rem',
              fontWeight: 600, cursor: 'pointer', marginTop: 8
            }}
          >
            Return to Query Chat
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
