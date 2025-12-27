import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

export function PwaUpdateToast() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const updateServiceWorkerRef = useRef<null | ((reloadPage?: boolean) => Promise<void>)>(null)

  useEffect(() => {
    const update = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true)
      },
      onOfflineReady() {
        // Silently handle offline ready, don't show toast
      },
    })
    updateServiceWorkerRef.current = update
  }, [])

  if (!needRefresh) return null

  return (
    <div className="fixed left-1/2 top-3 z-[70] w-[calc(min(560px,100vw)-32px)] -translate-x-1/2">
      <div className="rounded-2xl border border-brezn-border bg-brezn-panel/95 p-3 shadow-soft backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Update verfügbar</div>
            <div className="mt-0.5 text-xs text-brezn-muted">
              Eine neue Version wurde geladen. Reload aktiviert sie.
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => void updateServiceWorkerRef.current?.(true)}
              className="rounded-xl bg-brezn-gold px-3 py-2 text-xs font-semibold text-brezn-bg hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
            >
              Reload
            </button>
            <button
              onClick={() => {
                setNeedRefresh(false)
              }}
              aria-label="Schließen"
              className="rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-lg font-semibold leading-none hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
            >
              <span className="text-red-500">×</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

