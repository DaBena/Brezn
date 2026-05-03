import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { useBreznDocumentLang } from './hooks/useBreznDocumentLang'
import { whenIdentityReady } from './lib/nostrClient'

function RootInner() {
  const { t } = useTranslation()
  useBreznDocumentLang()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    void whenIdentityReady.finally(() => setReady(true))
  }, [])
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brezn-bg text-brezn-muted">
        <span className="text-sm">{t('root.loading')}</span>
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

export function Root() {
  return <RootInner />
}
