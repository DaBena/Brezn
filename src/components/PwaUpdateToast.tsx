import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { registerSW } from 'virtual:pwa-register'
import { buttonBase } from '../lib/buttonStyles'
import { CloseIcon } from './CloseIcon'

export function PwaUpdateToast() {
  const { t } = useTranslation()
  const [needRefresh, setNeedRefresh] = useState(false)
  const updateServiceWorkerRef = useRef<null | ((reloadPage?: boolean) => Promise<void>)>(null)

  useEffect(() => {
    // In dev, skip SW registration so the app always loads normally (no offline fallback page).
    if (import.meta.env.DEV) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.unregister())
        })
      }
      return
    }
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
      <div className="rounded-lg border border-brezn-border bg-brezn-panel p-3 text-brezn-text">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{t('pwa.title')}</div>
            <div className="mt-0.5 text-xs text-brezn-muted">{t('pwa.body')}</div>
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
              {t('pwa.reload')}
            </button>
            <button
              onClick={() => {
                setNeedRefresh(false)
              }}
              aria-label={t('pwa.close')}
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

