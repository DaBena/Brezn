import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'

// enforce dark mode only
document.documentElement.classList.add('dark')

// Suppress harmless WebSocket errors from nostr-tools SimplePool
// These occur when a WebSocket is closed while already closing/closed (race condition)
// The errors are harmless and can be safely ignored
if (typeof window !== 'undefined') {
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    const message = args[0]?.toString() || ''
    // Suppress "WebSocket is already in CLOSING or CLOSED state" errors
    if (message.includes('WebSocket is already in CLOSING') || message.includes('WebSocket is already in CLOSED')) {
      return // Silently ignore
    }
    originalError.apply(console, args)
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
)
