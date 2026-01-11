import { useEffect, useState } from 'react'
import * as nip19 from 'nostr-tools/nip19'
import type { BreznNostrClient, Conversation } from '../lib/nostrClient'
import { shortNpub } from '../lib/nostrUtils'
import { Sheet } from './Sheet'
import { DMSheet } from './DMSheet'

export function ConversationsSheet(props: {
  open: boolean
  onClose: () => void
  client: BreznNostrClient
}) {
  const { open, onClose, client } = props
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPubkey, setSelectedPubkey] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    // Avoid synchronous setState inside effect body (lint rule).
    Promise.resolve().then(() => {
      setLoading(true)
      setError(null)
      setConversations([])
      setSelectedPubkey(null)
    })

    // Check if browser reports offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      Promise.resolve().then(() => {
        setError('Offline - Please check your internet connection.')
        setLoading(false)
      })
      return
    }

    const timeout = setTimeout(() => {
      setError('Timeout - Relays are not responding. Please check your relay settings.')
      setLoading(false)
    }, 5000) // Reduced from 10000 to 5000

    client
      .getConversations()
      .then(convos => {
        clearTimeout(timeout)
        setConversations(convos)
        setLoading(false)
      })
      .catch(err => {
        clearTimeout(timeout)
        setError(err instanceof Error ? err.message : 'Error loading conversations')
        setLoading(false)
      })

    return () => clearTimeout(timeout)
  }, [open, client])

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp * 1000)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  return (
    <>
      <Sheet open={open && !selectedPubkey} title="Chat" onClose={onClose}>
        <div className="mt-4 space-y-2">
          {loading ? (
            <div className="text-center text-sm text-brezn-muted py-8">Loading conversations…</div>
          ) : error ? (
            <div className="text-center text-sm text-brezn-danger py-8">{error}</div>
          ) : conversations.length === 0 ? (
            <div className="text-center text-sm text-brezn-muted py-8">No conversations yet</div>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.pubkey}
                onClick={() => setSelectedPubkey(conv.pubkey)}
                className="w-full text-left rounded-lg border border-brezn-border bg-brezn-panel2 p-4 hover:bg-brezn-panel transition-colors focus:outline-none"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm font-semibold truncate">{shortNpub(nip19.npubEncode(conv.pubkey), 12, 8)}</div>
                    <div className="mt-1 text-xs text-brezn-muted truncate">{conv.lastMessagePreview}</div>
                  </div>
                  <div className="shrink-0 text-[10px] text-brezn-muted">{formatTime(conv.lastMessageAt)}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </Sheet>

      {selectedPubkey && (
        <DMSheet
          open={!!selectedPubkey}
          onClose={() => {
            setSelectedPubkey(null)
            onClose()
          }}
          client={client}
          otherPubkey={selectedPubkey}
        />
      )}
    </>
  )
}

