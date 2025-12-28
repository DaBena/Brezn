import { useMemo, useState } from 'react'
import type { BreznNostrClient } from '../../lib/nostrClient'
import { useToast } from '../Toast'

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
  const identity = useMemo(() => client.getPublicIdentity(), [client])
  const privateIdentity = useMemo(() => client.getPrivateIdentity(), [client])
  const { showToast } = useToast()
  const [showPrivKey, setShowPrivKey] = useState(false)
  const [keyMsg, setKeyMsg] = useState<string | null>(null)
  const [importNsec, setImportNsec] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  return (
    <div className="rounded-2xl border border-brezn-border bg-brezn-panel2 p-3">
      <div className="text-xs font-semibold text-brezn-muted">Identity</div>
      <div className="mt-1 text-xs text-brezn-muted">
        <span className="font-mono">npub</span>:
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate rounded-xl border border-brezn-border bg-brezn-panel p-2 font-mono text-xs">
          {identity.npub}
        </div>
        <button
          type="button"
          onClick={() => {
            void copyToClipboard(identity.npub).then(ok => {
              setKeyMsg(ok ? 'npub copied.' : 'Show & copy npub.')
            })
          }}
          className="shrink-0 rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-xs hover:bg-brezn-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
        >
          Copy
        </button>
      </div>

      <div className="mt-3 text-xs text-brezn-muted">
        <span className="font-mono">nsec</span>:
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate rounded-xl border border-brezn-border bg-brezn-panel p-2 font-mono text-xs">
          {showPrivKey ? privateIdentity.nsec : '••••••••••••••••••••••••••••••••'}
        </div>
        <button
          type="button"
          onClick={() => setShowPrivKey(v => !v)}
          className="shrink-0 rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-xs hover:bg-brezn-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
        >
          {showPrivKey ? 'Hide' : 'Show'}
        </button>
        <button
          type="button"
          onClick={() => {
            void copyToClipboard(privateIdentity.nsec).then(ok => {
              setKeyMsg(ok ? 'nsec copied.' : 'Show & copy nsec.')
            })
          }}
          className="shrink-0 rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-xs hover:bg-brezn-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
          disabled={!showPrivKey}
        >
          Copy
        </button>
      </div>
      <div className="mt-2 text-[11px] text-brezn-muted">
        Never share your <span className="font-mono">nsec</span>.
      </div>
      {keyMsg ? <div className="mt-2 text-xs text-brezn-muted">{keyMsg}</div> : null}

      <div className="mt-4 border-t border-brezn-border pt-3">
        <div className="text-xs font-semibold text-brezn-muted mb-2">Import Identity</div>
        <div className="text-[11px] text-brezn-muted mb-2">
          Import an existing <span className="font-mono">nsec</span> to restore your identity. This will replace your current identity.
        </div>
        {!showImport ? (
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="w-full rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-xs hover:bg-brezn-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
          >
            Import nsec
          </button>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              value={importNsec}
              onChange={e => setImportNsec(e.target.value)}
              placeholder="nsec1..."
              className="w-full rounded-xl border border-brezn-border bg-brezn-panel p-2 font-mono text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
              disabled={isImporting}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  const trimmed = importNsec.trim()
                  if (!trimmed) {
                    showToast('Please enter an nsec', 'error')
                    return
                  }

                  setIsImporting(true)
                  try {
                    client.setIdentity(trimmed)
                    setImportNsec('')
                    setShowImport(false)
                    showToast('Identity imported successfully. Page will reload...', 'success')
                    // Reload page to ensure all state is refreshed
                    setTimeout(() => {
                      window.location.reload()
                    }, 1000)
                  } catch (error) {
                    showToast(error instanceof Error ? error.message : 'Failed to import nsec', 'error')
                  } finally {
                    setIsImporting(false)
                  }
                }}
                disabled={isImporting || !importNsec.trim()}
                className="flex-1 rounded-xl bg-brezn-gold px-3 py-2 text-xs font-semibold text-brezn-bg hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40 disabled:opacity-50"
              >
                {isImporting ? 'Importing...' : 'Import'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowImport(false)
                  setImportNsec('')
                }}
                disabled={isImporting}
                className="rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-xs hover:bg-brezn-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

