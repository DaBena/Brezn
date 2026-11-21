import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buttonBase } from '../lib/buttonStyles'
import { unlockIdentityVault } from '../lib/nostrClient'

type UnlockVaultModalProps = {
  onUnlocked: () => void
}

export function UnlockVaultModal({ onUnlocked }: UnlockVaultModalProps) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!password) {
      setError(t('keyMgmt.passwordRequired'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await unlockIdentityVault(password)
      setPassword('')
      onUnlocked()
    } catch {
      setError(t('keyMgmt.unlockFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      data-testid="unlock-vault"
      className="flex min-h-screen items-center justify-center bg-brezn-bg p-4 text-brezn-text"
    >
      <div className="w-full max-w-sm space-y-3 rounded-2xl border border-brezn-text/20 bg-brezn-panel p-4">
        <div className="text-sm font-semibold">{t('keyMgmt.unlockTitle')}</div>
        <p className="text-xs text-brezn-muted">{t('keyMgmt.unlockBody')}</p>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          placeholder={t('keyMgmt.passwordPlaceholder')}
          className="w-full border border-brezn-text bg-brezn-bg p-2 text-base focus:outline-none"
          disabled={busy}
        />
        {error ? <div className="text-xs text-red-600">{error}</div> : null}
        <p className="text-[11px] text-brezn-muted">{t('keyMgmt.forgotPasswordHint')}</p>
        <button
          type="button"
          disabled={busy || !password}
          onClick={() => void submit()}
          className={`w-full rounded-xl px-3 py-2 text-sm font-semibold ${buttonBase}`}
        >
          {busy ? t('keyMgmt.unlocking') : t('keyMgmt.unlock')}
        </button>
      </div>
    </div>
  )
}
