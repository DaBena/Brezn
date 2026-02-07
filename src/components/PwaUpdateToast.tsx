import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { buttonBase } from '../lib/buttonStyles'
import { CloseIcon } from './CloseIcon'

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
      <div className="rounded-lg border border-brezn-border bg-white p-3 shadow-soft dark:bg-brezn-panel">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Update available</div>
            <div className="mt-0.5 text-xs text-brezn-muted">
              A new version has been loaded. Reload to activate it.
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={async () => {
                try {
                  if (updateServiceWorkerRef.current) {
                    await updateServiceWorkerRef.current(true)
                  } else {
                    // Fallback: reload page manually if update function is not available
                    window.location.reload()
                  }
                } catch (error) {
                  // If update fails, reload page manually
                  console.error('Failed to update service worker:', error)
                  window.location.reload()
                }
              }}
              className={`rounded-xl px-3 py-2 text-xs font-semibold ${buttonBase}`}
            >
              Reload
            </button>
            <button
              onClick={() => {
                setNeedRefresh(false)
              }}
              aria-label="Close"
              className="shrink-0 hover:opacity-80 focus:outline-none"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

