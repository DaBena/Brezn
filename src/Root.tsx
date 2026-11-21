import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { UnlockVaultModal } from './components/UnlockVaultModal'
import { useBreznDocumentLang } from './hooks/useBreznDocumentLang'
import { VAULT_IDLE_LOCK_MS } from './lib/constants'
import {
  getStoredSkProtection,
  identityMaterialMayExistOnDisk,
  isIdentityStorageReady,
  isIdentityVaultLocked,
  lockIdentityVault,
  onIdentityVaultLocked,
  whenIdentityReady,
  whenIdentityStorageSettled,
} from './lib/nostrClient'
import { SK_PROTECTION_PASSWORD } from './lib/skVault'

/** Best-effort clickjacking mitigation where frame-ancestors headers are unavailable (e.g. GitHub Pages). */
function refuseForeignFrame(): boolean {
  try {
    if (typeof window === 'undefined') return false
    if (window.top === window.self) return false
    // Same-origin embed (rare): allow. Cross-origin: top.location throws → treat as framed.
    try {
      void window.top!.location.href
      return false
    } catch {
      document.documentElement.innerHTML = ''
      return true
    }
  } catch {
    return false
  }
}

function RootInner() {
  const { t } = useTranslation()
  useBreznDocumentLang()
  const [framed] = useState(() => refuseForeignFrame())
  const [ready, setReady] = useState(false)
  const [needsUnlock, setNeedsUnlock] = useState(false)
  useEffect(() => {
    if (framed) return
    let cancelled = false
    void (async () => {
      await whenIdentityReady
      if (cancelled) return
      const waitForDisk =
        !isIdentityStorageReady() && (isIdentityVaultLocked() || identityMaterialMayExistOnDisk())
      if (waitForDisk) await whenIdentityStorageSettled
      if (cancelled) return
      setNeedsUnlock(isIdentityVaultLocked())
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [framed])
  useEffect(() => onIdentityVaultLocked(() => setNeedsUnlock(true)), [])
  useEffect(() => {
    if (framed || !ready || needsUnlock) return
    let timer: number | null = null
    const clearTimer = () => {
      if (timer != null) window.clearTimeout(timer)
      timer = null
    }
    const onVisibility = () => {
      clearTimer()
      if (document.visibilityState !== 'hidden') return
      if (getStoredSkProtection() !== SK_PROTECTION_PASSWORD) return
      timer = window.setTimeout(() => {
        if (lockIdentityVault()) setNeedsUnlock(true)
      }, VAULT_IDLE_LOCK_MS)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearTimer()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [framed, ready, needsUnlock])
  if (framed) {
    return null
  }
  if (!ready) {
    return (
      <div
        data-testid="bootstrap-loading"
        className="flex min-h-screen items-center justify-center bg-brezn-bg text-brezn-muted"
      >
        <span className="text-sm">{t('root.loading')}</span>
      </div>
    )
  }
  if (needsUnlock) {
    return <UnlockVaultModal onUnlocked={() => setNeedsUnlock(false)} />
  }
  return (
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  )
}

export function Root() {
  return <RootInner />
}
