import { useEffect, useRef, useState } from 'react'
import type { BreznNostrClient, DecryptedDM } from '../lib/nostrClient'
import { shortHex } from '../lib/nostrUtils'
import { Sheet } from './Sheet'

export function DMSheet(props: {
  open: boolean
  onClose: () => void
  client: BreznNostrClient
  otherPubkey: string
}) {
  const { open, onClose, client, otherPubkey } = props
  const [messages, setMessages] = useState<DecryptedDM[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const identity = client.getPublicIdentity()

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setMessages([])
    setMessageText('')

    let mounted = true

    // Check if browser reports offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError('Offline – Bitte prüfe deine Internetverbindung.')
      setLoading(false)
      return
    }

    const timeout = setTimeout(() => {
      if (mounted) {
        setError('Timeout – Relays antworten nicht. Bitte prüfe deine Relay-Einstellungen.')
        setLoading(false)
      }
    }, 5000) // Reduced from 10000 to 5000

    client
      .getDMsWith(otherPubkey)
      .then(msgs => {
        if (mounted) {
          clearTimeout(timeout)
          setMessages(msgs)
          setLoading(false)
        }
      })
      .catch(err => {
        if (mounted) {
          clearTimeout(timeout)
          setError(err instanceof Error ? err.message : 'Fehler beim Laden der Nachrichten')
          setLoading(false)
        }
      })

    return () => {
      clearTimeout(timeout)
    }

    // Subscribe to new messages I sent
    const unsub1 = client.subscribe(
      { kinds: [4], authors: [identity.pubkey], '#p': [otherPubkey] },
      {
        onevent: async evt => {
          try {
            const decryptedContent = await client.decryptDM(evt)
            const newMessage: DecryptedDM = {
              event: evt,
              decryptedContent,
              isFromMe: true,
            }
            if (mounted) {
              setMessages(prev => {
                // Avoid duplicates
                if (prev.some(m => m.event.id === evt.id)) return prev
                return [...prev, newMessage].sort((a, b) => a.event.created_at - b.event.created_at)
              })
            }
          } catch {
            // Skip messages that can't be decrypted
          }
        },
      },
    )

    // Subscribe to new messages I received
    const unsub2 = client.subscribe(
      { kinds: [4], authors: [otherPubkey], '#p': [identity.pubkey] },
      {
        onevent: async evt => {
          try {
            const decryptedContent = await client.decryptDM(evt)
            const newMessage: DecryptedDM = {
              event: evt,
              decryptedContent,
              isFromMe: false,
            }
            if (mounted) {
              setMessages(prev => {
                // Avoid duplicates
                if (prev.some(m => m.event.id === evt.id)) return prev
                return [...prev, newMessage].sort((a, b) => a.event.created_at - b.event.created_at)
              })
            }
          } catch {
            // Skip messages that can't be decrypted
          }
        },
      },
    )

    const unsubscribe = () => {
      unsub1()
      unsub2()
    }

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [open, otherPubkey, client, identity.pubkey])

  useEffect(() => {
    if (open && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open, messages])

  async function sendMessage() {
    const content = messageText.trim()
    if (!content || sending) return

    // Check if browser reports offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError('Offline – Nachricht kann nicht gesendet werden.')
      return
    }

    setSending(true)
    setError(null)
    
    // Optimistically add message to UI
    const tempId = `temp-${Date.now()}`
    const optimisticMessage: DecryptedDM = {
      event: {
        id: tempId,
        pubkey: identity.pubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 4,
        tags: [['p', otherPubkey]],
        content: '[wird gesendet...]',
        sig: '',
      },
      decryptedContent: content,
      isFromMe: true,
    }
    setMessages(prev => [...prev, optimisticMessage].sort((a, b) => a.event.created_at - b.event.created_at))
    
    try {
      await client.sendDM(otherPubkey, content)
      setMessageText('')
      // Remove optimistic message - real one will appear via subscription
      setMessages(prev => prev.filter(m => m.event.id !== tempId))
    } catch (e) {
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.event.id !== tempId))
      setError(e instanceof Error ? e.message : 'Fehler beim Senden')
    } finally {
      setSending(false)
    }
  }

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp * 1000)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'gerade eben'
    if (diffMins < 60) return `vor ${diffMins} Min`
    if (diffHours < 24) return `vor ${diffHours} Std`
    if (diffDays < 7) return `vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  return (
    <Sheet open={open} title={`DM: ${shortHex(otherPubkey)}`} onClose={onClose}>
      <div className="flex flex-col" style={{ height: 'calc(100dvh - 8rem)' }}>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-4">
          {loading ? (
            <div className="text-center text-sm text-brezn-muted py-8">Lade Nachrichten…</div>
          ) : error ? (
            <div className="text-center text-sm text-brezn-danger py-8">{error}</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-sm text-brezn-muted py-8">Noch keine Nachrichten</div>
          ) : (
            messages.map(msg => (
              <div
                key={msg.event.id}
                className={`flex ${msg.isFromMe ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                    msg.isFromMe
                      ? 'bg-brezn-gold text-brezn-bg'
                      : 'bg-brezn-panel2 border border-brezn-border'
                  }`}
                >
                  <div className="text-sm whitespace-pre-wrap break-words">{msg.decryptedContent}</div>
                  <div
                    className={`text-[10px] mt-1 ${
                      msg.isFromMe ? 'text-brezn-bg/70' : 'text-brezn-muted'
                    }`}
                  >
                    {formatTime(msg.event.created_at)}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="sticky bottom-0 -mx-4 border-t border-brezn-border bg-brezn-panel px-4 pb-[env(safe-area-inset-bottom)] pt-3">
          {error ? <div className="mb-2 text-xs text-brezn-danger">{error}</div> : null}
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void sendMessage()
                }
              }}
              placeholder="Nachricht schreiben…"
              className="flex-1 h-20 resize-none rounded-2xl border border-brezn-border bg-brezn-panel2 p-3 text-sm outline-none focus:ring-2 focus:ring-brezn-gold/40"
              disabled={sending}
            />
            <button
              onClick={sendMessage}
              disabled={sending || !messageText.trim()}
              aria-label="Nachricht senden"
              className="rounded-2xl bg-brezn-gold px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
            >
              {sending ? '…' : '→'}
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  )
}

