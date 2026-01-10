import React, { Component, type ReactNode } from 'react'
import { buttonBase } from '../lib/buttonStyles'

type ErrorBoundaryState = {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

type ErrorBoundaryProps = {
  children: ReactNode
  fallback?: (error: Error | null, errorInfo: React.ErrorInfo | null, reset: () => void) => ReactNode
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log detailed error information
    const errorDetails = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
    }
    
    console.error('ErrorBoundary caught an error:', errorDetails)
    
    // In development, log full details
    if (process.env.NODE_ENV === 'development') {
      console.error('Full error object:', error)
      console.error('Full error info:', errorInfo)
    }

    this.setState({
      error,
      errorInfo,
    })
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.state.errorInfo, this.handleReset)
      }

      return (
        <div className="min-h-dvh bg-brezn-bg text-brezn-text flex items-center justify-center p-4">
          <div className="max-w-xl w-full rounded-lg border border-brezn-border bg-brezn-panel p-6 shadow-soft">
            <div className="text-lg font-semibold text-brezn-danger mb-2">Something went wrong</div>
            <div className="text-sm text-brezn-muted mb-4">
              An unexpected error occurred. Please try refreshing the page.
            </div>
            {this.state.error && (
              <details className="mb-4">
                <summary className="text-xs text-brezn-muted cursor-pointer hover:text-brezn-text mb-2">
                  Error details
                </summary>
                <div className="rounded-xl border border-brezn-border bg-brezn-panel2 p-3 font-mono text-xs text-brezn-muted overflow-auto max-h-64">
                  <div className="mb-2">
                    <strong>Error:</strong> {this.state.error.message}
                  </div>
                  {this.state.error.stack && (
                    <div className="mb-2">
                      <strong>Stack trace:</strong>
                      <pre className="mt-1 whitespace-pre-wrap text-[10px]">{this.state.error.stack}</pre>
                    </div>
                  )}
                  {this.state.errorInfo && (
                    <div>
                      <strong>Component stack:</strong>
                      <pre className="mt-1 whitespace-pre-wrap text-[10px]">{this.state.errorInfo.componentStack}</pre>
                    </div>
                  )}
                </div>
              </details>
            )}
            <div className="flex gap-2">
              <button
                onClick={this.handleReset}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${buttonBase}`}
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${buttonBase}`}
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

