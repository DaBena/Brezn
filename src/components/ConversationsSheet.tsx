import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { nip19 } from '../lib/nostrPrimitives'
import { formatRelativeChatTime } from '../lib/formatRelativeTime'
import { GET_CONVERSATIONS_UI_TIMEOUT_MS } from '../lib/constants'
import type { BreznNostrClient, Conversation } from '../lib/nostrClient'
import { shortNpub } from '../lib/nostrUtils'
import { Sheet } from './Sheet'
import { DMSheet } from './DMSheet'

export function ConversationsSheet(props: {
  open: boolean
  onClose: () => void
  client: BreznNostrClient
}) {
  const { t } = useTranslation()
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
        setError(t('chat.offline'))
        setLoading(false)
      })
      return
    }

    let uiTimeout: ReturnType<typeof setTimeout> | undefined
    const clearUiTimeout = () => {
      if (uiTimeout !== undefined) {
        clearTimeout(uiTimeout)
        uiTimeout = undefined
      }
    }

    uiTimeout = setTimeout(() => {
      setError(t('chat.timeout'))
      setLoading(false)
    }, GET_CONVERSATIONS_UI_TIMEOUT_MS)

    client
      .getConversations({
        onProgress: (convos) => {
          clearUiTimeout()
          setConversations(convos)
          setLoading(false)
        },
      })
      .then((convos) => {
        clearUiTimeout()
        setConversations(convos)
        setLoading(false)
      })
      .catch((err) => {
        clearUiTimeout()
        setError(err instanceof Error ? err.message : t('chat.loadError'))
        setLoading(false)
      })

    return () => clearUiTimeout()
  }, [open, client, t])

  return (
    <>
      <Sheet open={open && !selectedPubkey} title={t('chat.title')} onClose={onClose}>
        <div className="mt-4 space-y-2">
          {loading ? (
            <div className="text-center text-sm text-brezn-muted py-8">{t('chat.loading')}</div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-brezn-error">{error}</div>
          ) : conversations.length === 0 ? (
            <div className="text-center text-sm text-brezn-muted py-8">{t('chat.empty')}</div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.pubkey}
                onClick={() => setSelectedPubkey(conv.pubkey)}
                className="w-full text-left rounded-lg border border-brezn-border bg-brezn-bg p-4 focus:outline-none"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm font-semibold text-brezn-text truncate">
                      {shortNpub(nip19.npubEncode(conv.pubkey), 12, 8)}
                    </div>
                    <div className="mt-1 text-xs text-brezn-muted truncate">
                      {conv.lastMessagePreview}
                    </div>
                  </div>
                  <div className="shrink-0 text-[10px] text-brezn-text">
                    {formatRelativeChatTime(t, conv.lastMessageAt)}
                  </div>
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
