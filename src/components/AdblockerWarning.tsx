import { useEffect, useState } from 'react'
import { CloseIcon } from './CloseIcon'

export function AdblockerWarning() {
  const [showWarning, setShowWarning] = useState(false)

  useEffect(() => {
    // In dev we intentionally don't register a SW – skip this check
    if (import.meta.env.DEV) return
    // Check if service worker is registered after a delay
    // If not, it might be blocked by an adblocker
    const timeout = setTimeout(async () => {
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations()
          // If no service worker is registered after 3 seconds, it might be blocked
          if (registrations.length === 0) {
            setShowWarning(true)
          }
        } catch {
          // Service worker access failed - might be blocked
          setShowWarning(true)
        }
      }
    }, 3000)

    return () => clearTimeout(timeout)
  }, [])

  if (!showWarning) return null

  return (
    <div className="fixed left-1/2 top-3 z-[70] w-[calc(min(560px,100vw)-32px)] -translate-x-1/2">
      <div className="rounded-lg border border-brezn-border bg-brezn-panel/95 p-3 shadow-soft backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Service Worker blocked</div>
            <div className="mt-0.5 text-xs text-brezn-muted">
              An adblocker may be blocking the service worker. Please disable the adblocker for this site or add an exception.
            </div>
          </div>
          <button
            onClick={() => setShowWarning(false)}
            aria-label="Close"
            className="shrink-0 hover:opacity-80 focus:outline-none"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  )
}

