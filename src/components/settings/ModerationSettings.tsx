import { useEffect, useState } from 'react'
import type { BreznNostrClient } from '../../lib/nostrClient'

type ModerationSettingsProps = {
  client: BreznNostrClient
  onModerationChanged?: () => void
}

export function ModerationSettings({ client, onModerationChanged }: ModerationSettingsProps) {
  const [mutedTerms, setMutedTerms] = useState<string[]>(() => client.getMutedTerms())
  const [mutedTermsText, setMutedTermsText] = useState(() => client.getMutedTerms().join('\n'))
  const [mutedTermsMsg, setMutedTermsMsg] = useState<string | null>(null)

  const [blockedPubkeys, setBlockedPubkeys] = useState<string[]>(() => client.getBlockedPubkeys())
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null)

  // Reset when client changes (e.g., when sheet opens)
  useEffect(() => {
    const nextTerms = client.getMutedTerms()
    setMutedTerms(nextTerms)
    setMutedTermsText(nextTerms.join('\n'))
    setMutedTermsMsg(null)
    const nextBlocked = client.getBlockedPubkeys()
    setBlockedPubkeys(nextBlocked)
    setBlockedMsg(null)
  }, [client])

  function saveMutedTerms(nextTerms: string[], msg: string) {
    setMutedTermsMsg(null)
    client.setMutedTerms(nextTerms)
    const normalized = client.getMutedTerms()
    setMutedTerms(normalized)
    setMutedTermsText(normalized.join('\n'))
    setMutedTermsMsg(msg)
    onModerationChanged?.()
  }

  function unblockUser(pubkey: string) {
    const next = blockedPubkeys.filter(p => p !== pubkey)
    client.setBlockedPubkeys(next)
    setBlockedPubkeys(client.getBlockedPubkeys())
    setBlockedMsg('User unblocked.')
    onModerationChanged?.()
  }

  // Reset state when component mounts or client changes
  // This is handled by parent component's useEffect

  return (
    <>
      <div className="rounded-2xl border border-brezn-border bg-brezn-panel2 p-3">
        <div className="text-xs font-semibold text-brezn-muted">Blocklist</div>
        <div className="mt-1 text-xs text-brezn-muted">1 line = 1 term ({mutedTerms.length}/200)</div>
        <textarea
          value={mutedTermsText}
          onChange={e => setMutedTermsText(e.target.value)}
          onBlur={() => saveMutedTerms(mutedTermsText.split('\n').map(l => l.trim()).filter(Boolean), 'Blocklist saved.')}
          placeholder={'e.g.\nspam\nbuy now\ntelegram.me'}
          className="mt-2 h-28 w-full resize-none rounded-xl border border-brezn-border bg-brezn-panel2 p-2 font-mono text-xs outline-none focus:ring-2 focus:ring-brezn-gold/40"
        />
        {mutedTermsMsg ? <div className="mt-2 text-xs text-brezn-muted">{mutedTermsMsg}</div> : null}
      </div>

      <div className="rounded-2xl border border-brezn-border bg-brezn-panel2 p-3">
        <div className="text-xs font-semibold text-brezn-muted">Blocked users</div>
        <div className="mt-1 text-xs text-brezn-muted">{blockedPubkeys.length} blocked</div>
        {blockedPubkeys.length > 0 ? (
          <div className="mt-3 space-y-2">
            {blockedPubkeys.map(pubkey => (
              <div
                key={pubkey}
                className="flex items-center justify-between gap-2 rounded-xl border border-brezn-border bg-brezn-panel p-2"
              >
                <div className="min-w-0 flex-1 truncate font-mono text-xs">{pubkey}</div>
                <button
                  type="button"
                  onClick={() => unblockUser(pubkey)}
                  className="shrink-0 rounded-lg border border-brezn-border bg-brezn-panel2 px-3 py-1.5 text-[11px] font-semibold hover:bg-brezn-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 text-xs text-brezn-muted">No blocked users</div>
        )}
        {blockedMsg ? <div className="mt-2 text-xs text-brezn-muted">{blockedMsg}</div> : null}
      </div>
    </>
  )
}

