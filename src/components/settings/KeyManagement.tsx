import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buttonBase } from '../../lib/buttonStyles'
import type { BreznNostrClient } from '../../lib/nostrClient'
import { useToast } from '../ToastContext'

type KeyManagementProps = {
  client: BreznNostrClient
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      window.prompt('Copy (Ctrl/Cmd+C), then OK:', text)
    } catch {
      // ignore
    }
    return false
  }
}

export function KeyManagement({ client }: KeyManagementProps) {
  const { t } = useTranslation()
  const identity = useMemo(() => client.getPublicIdentity(), [client])
  const privateIdentity = useMemo(() => client.getPrivateIdentity(), [client])
  const { showToast } = useToast()
  const [showPrivKey, setShowPrivKey] = useState(false)
  const [keyMsg, setKeyMsg] = useState<string | null>(null)
  const [importNsec, setImportNsec] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  return (
    <div className="p-3">
      <div className="text-xs font-semibold text-brezn-muted">{t('keyMgmt.title')}</div>
      <div className="mt-1 text-xs text-brezn-muted">
        <span className="font-mono">{t('keyMgmt.npub')}</span>:
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate rounded-xl bg-brezn-panel p-2 font-mono text-xs">
          {identity.npub}
        </div>
        <button
          type="button"
          onClick={() => {
            void copyToClipboard(identity.npub).then(ok => {
              setKeyMsg(ok ? t('keyMgmt.npubCopied') : t('keyMgmt.copyNpubHint'))
            })
          }}
          className={`shrink-0 rounded-xl px-3 py-2 text-xs ${buttonBase}`}
        >
          {t('keyMgmt.copy')}
        </button>
      </div>

      <div className="mt-3 text-xs text-brezn-muted">
        <span className="font-mono">{t('keyMgmt.nsec')}</span>:
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate rounded-xl bg-brezn-panel p-2 font-mono text-xs">
          {showPrivKey ? privateIdentity.nsec : '••••••••••••••••••••••••••••••••'}
        </div>
        <button
          type="button"
          onClick={() => setShowPrivKey(v => !v)}
          className={`shrink-0 rounded-xl px-3 py-2 text-xs ${buttonBase}`}
        >
          {showPrivKey ? t('keyMgmt.hide') : t('keyMgmt.show')}
        </button>
        <button
          type="button"
          onClick={() => {
            void copyToClipboard(privateIdentity.nsec).then(ok => {
              setKeyMsg(ok ? t('keyMgmt.nsecCopied') : t('keyMgmt.copyNsecHint'))
            })
          }}
          className={`shrink-0 rounded-xl px-3 py-2 text-xs ${buttonBase}`}
          disabled={!showPrivKey}
        >
          {t('keyMgmt.copy')}
        </button>
      </div>
      <div className="mt-2 text-[11px] text-brezn-muted">{t('keyMgmt.neverShareNsec')}</div>
      {keyMsg ? <div className="mt-2 text-xs text-brezn-muted">{keyMsg}</div> : null}

      <div className="mt-4 pt-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-xs font-semibold text-brezn-muted">{t('keyMgmt.importTitle')}</div>
          {!showImport ? (
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className={`shrink-0 rounded-xl px-3 py-2 text-xs ${buttonBase}`}
            >
              {t('keyMgmt.importNsec')}
            </button>
          ) : null}
        </div>
        {showImport ? (
          <div className="space-y-2">
            <input
              type="text"
              value={importNsec}
              onChange={e => setImportNsec(e.target.value)}
              placeholder={t('keyMgmt.importPlaceholder')}
              className="w-full border border-brezn-text p-2 font-mono text-base focus:outline-none"
              disabled={isImporting}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  const trimmed = importNsec.trim()
                  if (!trimmed) {
                    showToast(t('keyMgmt.pleaseEnterNsec'), 'error')
                    return
                  }

                  setIsImporting(true)
                  try {
                    client.setIdentity(trimmed)
                    setImportNsec('')
                    setShowImport(false)
                    showToast(t('keyMgmt.importSuccess'))
                    // Reload page to ensure all state is refreshed
                    setTimeout(() => {
                      window.location.reload()
                    }, 1000)
                  } catch (error) {
                    const msg = error instanceof Error ? error.message : t('keyMgmt.importFailed')
                    showToast(msg, 'error')
                  } finally {
                    setIsImporting(false)
                  }
                }}
                disabled={isImporting || !importNsec.trim()}
                className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold ${buttonBase}`}
              >
                {isImporting ? t('keyMgmt.importing') : t('keyMgmt.import')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowImport(false)
                  setImportNsec('')
                }}
                disabled={isImporting}
                className={`rounded-xl px-3 py-2 text-xs ${buttonBase}`}
              >
                {t('keyMgmt.cancel')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

