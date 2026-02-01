import { useEffect, useState } from 'react'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { whenIdentityReady } from './lib/nostrClient'

export function Root() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    whenIdentityReady.then(() => setReady(true))
  }, [])
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brezn-bg text-brezn-muted">
        <span className="text-sm">Loading…</span>
      </div>
    )
  }
  return (
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  )
}
