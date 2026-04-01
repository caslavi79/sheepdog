import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) console.error('[Sheepdog] Uncaught error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0C0C0C',
          color: '#FFFFFF',
          fontFamily: 'sans-serif',
          padding: 32,
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 12, letterSpacing: 3, textTransform: 'uppercase', color: '#C23B22', marginBottom: 16 }}>
            Something went wrong
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>Application Error</h1>
          <p style={{ color: '#7A8490', fontSize: 14, maxWidth: 420, lineHeight: 1.6, marginBottom: 32 }}>
            {import.meta.env.DEV ? (this.state.error?.message || 'An unexpected error occurred.') : 'An unexpected error occurred. Please reload the page.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#C23B22',
              color: '#fff',
              border: 'none',
              padding: '10px 24px',
              borderRadius: 4,
              fontFamily: 'sans-serif',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
