import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buttonBase } from '../../lib/buttonStyles'
import { lockIdentityVault, type BreznNostrClient } from '../../lib/nostrClient'
import { SK_PROTECTION_PASSWORD } from '../../lib/skVault'
import { useToast } from '../ToastContext'

type KeyManagementProps = {
  client: BreznNostrClient
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function KeyManagement({ client }: KeyManagementProps) {
  const { t } = useTranslation()
  const identity = useMemo(() => client.getPublicIdentity(), [client])
  const { showToast } = useToast()
  const [showPrivKey, setShowPrivKey] = useState(false)
  const [revealedNsec, setRevealedNsec] = useState<string | null>(null)
  const [keyMsg, setKeyMsg] = useState<string | null>(null)
  const [importNsec, setImportNsec] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [protection, setProtection] = useState(() => client.getSkProtection())
  const [passwordMode, setPasswordMode] = useState<'off' | 'enable' | 'change' | 'disable'>('off')
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [pwCurrent, setPwCurrent] = useState('')
  const [revealPassword, setRevealPassword] = useState('')
  const [pwBusy, setPwBusy] = useState(false)

  const passwordEnabled = protection === SK_PROTECTION_PASSWORD

  useEffect(() => {
    if (!showPrivKey) return
    const id = window.setTimeout(() => {
      setShowPrivKey(false)
      setRevealedNsec(null)
      setRevealPassword('')
    }, 30_000)
    return () => window.clearTimeout(id)
  }, [showPrivKey])

  async function handleShowNsec() {
    if (showPrivKey) {
      setShowPrivKey(false)
      setRevealedNsec(null)
      setRevealPassword('')
      return
    }
    try {
      if (passwordEnabled) {
        if (!revealPassword) {
          showToast(t('keyMgmt.passwordRequired'), 'error')
          return
        }
        const nsec = await client.revealNsec(revealPassword)
        setRevealedNsec(nsec)
      } else {
        setRevealedNsec(client.getPrivateIdentity().nsec)
      }
      setShowPrivKey(true)
    } catch {
      showToast(t('keyMgmt.unlockFailed'), 'error')
    }
  }

  async function submitPasswordAction() {
    setPwBusy(true)
    try {
      if (passwordMode === 'enable') {
        if (pw1.length < 8) {
          showToast(t('keyMgmt.passwordTooShort'), 'error')
          return
        }
        if (pw1 !== pw2) {
          showToast(t('keyMgmt.passwordMismatch'), 'error')
          return
        }
        await client.enablePasswordProtection(pw1)
        setProtection(client.getSkProtection())
        showToast(t('keyMgmt.passwordEnabled'))
      } else if (passwordMode === 'change') {
        if (pw1.length < 8) {
          showToast(t('keyMgmt.passwordTooShort'), 'error')
          return
        }
        if (pw1 !== pw2) {
          showToast(t('keyMgmt.passwordMismatch'), 'error')
          return
        }
        await client.changePasswordProtection(pwCurrent, pw1)
        showToast(t('keyMgmt.passwordChanged'))
      } else if (passwordMode === 'disable') {
        await client.disablePasswordProtection(pwCurrent)
        setProtection(client.getSkProtection())
        showToast(t('keyMgmt.passwordDisabled'))
      }
      setPasswordMode('off')
      setPw1('')
      setPw2('')
      setPwCurrent('')
    } catch {
      showToast(t('keyMgmt.passwordActionFailed'), 'error')
    } finally {
      setPwBusy(false)
    }
  }

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
            void copyToClipboard(identity.npub).then((ok) => {
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
          {showPrivKey && revealedNsec ? revealedNsec : '••••••••••••••••••••••••••••••••'}
        </div>
        <button
          type="button"
          onClick={() => void handleShowNsec()}
          className={`shrink-0 rounded-xl px-3 py-2 text-xs ${buttonBase}`}
        >
          {showPrivKey ? t('keyMgmt.hide') : t('keyMgmt.show')}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!revealedNsec) return
            void copyToClipboard(revealedNsec).then((ok) => {
              setKeyMsg(ok ? t('keyMgmt.nsecCopied') : t('keyMgmt.copyNsecHint'))
            })
          }}
          className={`shrink-0 rounded-xl px-3 py-2 text-xs ${buttonBase}`}
          disabled={!showPrivKey || !revealedNsec}
        >
          {t('keyMgmt.copy')}
        </button>
      </div>
      {passwordEnabled && !showPrivKey ? (
        <input
          type="password"
          autoComplete="current-password"
          value={revealPassword}
          onChange={(e) => setRevealPassword(e.target.value)}
          placeholder={t('keyMgmt.passwordToReveal')}
          className="mt-2 w-full border border-brezn-text p-2 text-base focus:outline-none"
        />
      ) : null}
      <div className="mt-2 text-[11px] text-brezn-muted">{t('keyMgmt.neverShareNsec')}</div>
      {keyMsg ? <div className="mt-2 text-xs text-brezn-muted">{keyMsg}</div> : null}

      <div className="mt-4 border-t border-brezn-text/10 pt-3">
        <div className="text-xs font-semibold text-brezn-muted">{t('keyMgmt.passwordTitle')}</div>
        <p className="mt-1 text-[11px] text-brezn-muted">{t('keyMgmt.passwordHint')}</p>
        <p className="mt-1 text-[11px] text-brezn-muted">{t('keyMgmt.forgotPasswordHint')}</p>
        <div className="mt-2 text-[11px] text-brezn-muted">
          {passwordEnabled ? t('keyMgmt.passwordStatusOn') : t('keyMgmt.passwordStatusOff')}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {!passwordEnabled ? (
            <button
              type="button"
              className={`rounded-xl px-3 py-2 text-xs ${buttonBase}`}
              onClick={() => setPasswordMode(passwordMode === 'enable' ? 'off' : 'enable')}
            >
              {t('keyMgmt.enablePassword')}
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`rounded-xl px-3 py-2 text-xs ${buttonBase}`}
                onClick={() => {
                  if (!lockIdentityVault()) showToast(t('keyMgmt.passwordActionFailed'), 'error')
                }}
              >
                {t('keyMgmt.lockNow')}
              </button>
              <button
                type="button"
                className={`rounded-xl px-3 py-2 text-xs ${buttonBase}`}
                onClick={() => setPasswordMode(passwordMode === 'change' ? 'off' : 'change')}
              >
                {t('keyMgmt.changePassword')}
              </button>
              <button
                type="button"
                className={`rounded-xl px-3 py-2 text-xs ${buttonBase}`}
                onClick={() => setPasswordMode(passwordMode === 'disable' ? 'off' : 'disable')}
              >
                {t('keyMgmt.disablePassword')}
              </button>
            </>
          )}
        </div>
        {passwordMode !== 'off' ? (
          <div className="mt-2 space-y-2">
            {passwordMode === 'change' || passwordMode === 'disable' ? (
              <input
                type="password"
                autoComplete="current-password"
                value={pwCurrent}
                onChange={(e) => setPwCurrent(e.target.value)}
                placeholder={t('keyMgmt.currentPassword')}
                className="w-full border border-brezn-text p-2 text-base focus:outline-none"
                disabled={pwBusy}
              />
            ) : null}
            {passwordMode === 'enable' || passwordMode === 'change' ? (
              <>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                  placeholder={t('keyMgmt.newPassword')}
                  className="w-full border border-brezn-text p-2 text-base focus:outline-none"
                  disabled={pwBusy}
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  placeholder={t('keyMgmt.confirmPassword')}
                  className="w-full border border-brezn-text p-2 text-base focus:outline-none"
                  disabled={pwBusy}
                />
              </>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pwBusy}
                onClick={() => void submitPasswordAction()}
                className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold ${buttonBase}`}
              >
                {pwBusy ? t('keyMgmt.passwordWorking') : t('keyMgmt.passwordSave')}
              </button>
              <button
                type="button"
                disabled={pwBusy}
                onClick={() => {
                  setPasswordMode('off')
                  setPw1('')
                  setPw2('')
                  setPwCurrent('')
                }}
                className={`rounded-xl px-3 py-2 text-xs ${buttonBase}`}
              >
                {t('keyMgmt.cancel')}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
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
              type="password"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={importNsec}
              onChange={(e) => setImportNsec(e.target.value)}
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

                  if (!window.confirm(t('keyMgmt.importReplaceConfirm'))) return

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
