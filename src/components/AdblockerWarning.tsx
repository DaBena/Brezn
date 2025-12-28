import { useEffect, useState } from 'react'

export function AdblockerWarning() {
  const [showWarning, setShowWarning] = useState(false)

  useEffect(() => {
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
        } catch (e) {
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
      <div className="rounded-2xl border border-brezn-border bg-brezn-panel/95 p-3 shadow-soft backdrop-blur">
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
            className="shrink-0 rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-lg font-semibold leading-none hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
          >
            <span className="text-red-500">×</span>
          </button>
        </div>
      </div>
    </div>
  )
}

