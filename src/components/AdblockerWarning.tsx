import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CloseIcon } from './CloseIcon'

/**
 * Only meaningful once we try to register the PWA service worker (`viewerGeo5` set).
 * Before that we deliberately skip `registerSW`, so “no SW yet” is normal—not an adblocker.
 */
export function AdblockerWarning(props: { serviceWorkerExpected: boolean }) {
  const { serviceWorkerExpected } = props
  const { t } = useTranslation()
  const [adblockMaybe, setAdblockMaybe] = useState(false)

  useEffect(() => {
    // In dev we intentionally don't register a SW – skip this check
    if (import.meta.env.DEV) return
    if (!serviceWorkerExpected) return
    // Check if service worker is registered after a delay
    // If not, it might be blocked by an adblocker
    const timeout = setTimeout(async () => {
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations()
          // If no service worker is registered after 3 seconds, it might be blocked
          if (registrations.length === 0) {
            setAdblockMaybe(true)
          }
        } catch {
          // Service worker access failed - might be blocked
          setAdblockMaybe(true)
        }
      }
    }, 3000)

    return () => clearTimeout(timeout)
  }, [serviceWorkerExpected])

  if (!serviceWorkerExpected || !adblockMaybe) return null

  return (
    <div
      data-testid="adblock-warning"
      className="fixed left-1/2 top-3 z-[70] w-[calc(min(560px,100vw)-32px)] -translate-x-1/2"
    >
      <div className="rounded-lg border border-brezn-border bg-brezn-panel/95 p-3 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{t('adblock.title')}</div>
            <div className="mt-0.5 text-xs text-brezn-muted">{t('adblock.body')}</div>
          </div>
          <button
            onClick={() => setAdblockMaybe(false)}
            aria-label={t('adblock.close')}
            className="shrink-0 hover:opacity-80 focus:outline-none"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  )
}
