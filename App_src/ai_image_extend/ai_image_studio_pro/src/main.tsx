import React, { type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = { hasError: boolean; message: string }

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' }
  static getDerivedStateFromError(err: unknown): ErrorBoundaryState {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) }
  }
  componentDidCatch(err: unknown, info: React.ErrorInfo) {
    console.error(err, info)
  }
  render() {
    if (this.state.hasError)
      return (
        <div style={{ padding: 20, fontFamily: "sans-serif" }}>
          <h2>렌더링 오류</h2>
          <pre style={{ background: "#f5f5f5", padding: 10 }}>{this.state.message}</pre>
          <button onClick={() => this.setState({ hasError: false })}>다시 시도</button>
        </div>
      )
    return this.props.children
  }
}

const rootEl = document.getElementById('root')
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  )
}