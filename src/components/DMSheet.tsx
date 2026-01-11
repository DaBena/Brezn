import { useEffect, useRef, useState } from 'react'
import * as nip19 from 'nostr-tools/nip19'
import { buttonBase } from '../lib/buttonStyles'
import type { BreznNostrClient, DecryptedDM } from '../lib/nostrClient'
import { shortNpub } from '../lib/nostrUtils'
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
      setError('Offline - Please check your internet connection.')
      setLoading(false)
      return
    }

    const timeout = setTimeout(() => {
      if (mounted) {
        setError('Timeout - Relays are not responding. Please check your relay settings.')
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
          setError(err instanceof Error ? err.message : 'Error loading messages')
          setLoading(false)
        }
      })

    return () => {
      clearTimeout(timeout)
    }

    // Subscribe to new messages I sent
    const since = Math.floor(Date.now() / 1000) - 60 // last minute to catch just-sent messages
    const unsub1 = client.subscribe(
      { kinds: [4], authors: [identity.pubkey], '#p': [otherPubkey], since },
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
                // Remove any optimistic messages with matching content
                const filtered = prev.filter(m => !(m.event.id.startsWith('temp-') && m.decryptedContent === decryptedContent && m.isFromMe))
                return [...filtered, newMessage].sort((a, b) => a.event.created_at - b.event.created_at)
              })
            }
          } catch (e) {
            console.error('Failed to decrypt DM:', e)
            // Skip messages that can't be decrypted
          }
        },
      },
    )

    // Subscribe to new messages I received
    const unsub2 = client.subscribe(
      { kinds: [4], authors: [otherPubkey], '#p': [identity.pubkey], since },
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
          } catch (e) {
            console.error('Failed to decrypt DM:', e)
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
      setError('Offline - Message cannot be sent.')
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
        content: '[sending...]',
        sig: '',
      },
      decryptedContent: content,
      isFromMe: true,
    }
    setMessages(prev => [...prev, optimisticMessage].sort((a, b) => a.event.created_at - b.event.created_at))
    
    try {
      await client.sendDM(otherPubkey, content)
      setMessageText('')
      // Don't remove optimistic message - subscription will replace it with real one
      // Fallback: remove optimistic message after 5 seconds if real one hasn't arrived
      setTimeout(() => {
        setMessages(prev => {
          // Check if we have a real message with the same content from us
          const hasRealMessage = prev.some(m => 
            m.event.id !== tempId && 
            m.isFromMe && 
            m.decryptedContent === content
          )
          if (!hasRealMessage) {
            // Real message hasn't arrived - keep optimistic for now
            return prev
          }
          // Real message arrived - remove optimistic
          return prev.filter(m => m.event.id !== tempId)
        })
      }, 5000)
    } catch (e) {
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.event.id !== tempId))
      setError(e instanceof Error ? e.message : 'Error sending message')
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

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  return (
    <Sheet open={open} title={`DM: ${shortNpub(nip19.npubEncode(otherPubkey), 8, 4)}`} onClose={onClose}>
      <div className="flex flex-col" style={{ height: 'calc(100dvh - 8rem)' }}>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-4">
          {loading ? (
            <div className="text-center text-sm text-brezn-muted py-8">Loading messages…</div>
          ) : error ? (
            <div className="text-center text-sm text-brezn-danger py-8">{error}</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-sm text-brezn-muted py-8">No messages yet</div>
          ) : (
            messages.map(msg => (
              <div
                key={msg.event.id}
                className={`flex ${msg.isFromMe ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-lg px-4 py-2 ${
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
              placeholder="Write message…"
              className="flex-1 h-20 resize-none border border-brezn-border bg-brezn-panel2 p-3 text-sm outline-none"
              disabled={sending}
            />
            <button
              onClick={sendMessage}
              disabled={sending || !messageText.trim()}
              aria-label="Send message"
              className={`rounded-lg px-4 py-3 text-sm font-semibold ${buttonBase}`}
            >
              {sending ? '…' : '→'}
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  )
}

