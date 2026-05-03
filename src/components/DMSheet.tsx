import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { nip19, type Event } from '../lib/nostrPrimitives'
import { buttonBase } from '../lib/buttonStyles'
import { formatRelativeChatTime } from '../lib/formatRelativeTime'
import { GET_CONVERSATIONS_UI_TIMEOUT_MS } from '../lib/constants'
import { contentMatchesMutedTerms } from '../lib/moderation'
import type { BreznNostrClient, DecryptedDM } from '../lib/nostrClient'
import { NOSTR_KINDS } from '../lib/breznNostr'
import { shortNpub } from '../lib/nostrUtils'
import { Sheet } from './Sheet'
import { useToast } from './ToastContext'

function sortDms(list: DecryptedDM[]): DecryptedDM[] {
  return [...list].sort((a, b) => a.event.created_at - b.event.created_at)
}

function mergeIncomingDm(prev: DecryptedDM[], msg: DecryptedDM, fromMe: boolean): DecryptedDM[] {
  if (prev.some((m) => m.event.id === msg.event.id)) return prev
  let next = prev
  if (fromMe) {
    next = prev.filter(
      (m) =>
        !(
          m.event.id.startsWith('temp-') &&
          m.decryptedContent === msg.decryptedContent &&
          m.isFromMe
        ),
    )
  }
  return sortDms([...next, msg])
}

export function DMSheet(props: {
  open: boolean
  onClose: () => void
  client: BreznNostrClient
  otherPubkey: string
  mutedTerms: string[]
  blockedPubkeys: string[]
  isOffline: boolean
  onBlockUser: (pubkey: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const { open, onClose, client, otherPubkey, mutedTerms, blockedPubkeys, isOffline, onBlockUser } =
    props
  const [messages, setMessages] = useState<DecryptedDM[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [blockState, setBlockState] = useState<'idle' | 'blocking'>('idle')
  const [showReportField, setShowReportField] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const reportTextareaRef = useRef<HTMLTextAreaElement>(null)

  const myPubkey = client.getPublicIdentity().pubkey
  const peer = otherPubkey.trim().toLowerCase()
  const isBlocked = blockedPubkeys.some((b) => b.toLowerCase() === peer)

  useEffect(() => {
    if (!open || !isBlocked) return
    onClose()
  }, [open, isBlocked, onClose])

  useEffect(() => {
    if (showReportField && reportTextareaRef.current) {
      reportTextareaRef.current.focus()
    }
  }, [showReportField])

  useEffect(() => {
    if (!open) return

    let alive = true
    const me = myPubkey.trim().toLowerCase()

    setLoading(true)
    setError(null)
    setMessages([])
    setMessageText('')

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError(t('dm.offline'))
      setLoading(false)
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
      if (!alive) return
      setError(t('dm.timeout'))
      setLoading(false)
    }, GET_CONVERSATIONS_UI_TIMEOUT_MS)

    void client
      .getDMsWith(peer, {
        onProgress: (msgs) => {
          if (!alive) return
          clearUiTimeout()
          setMessages(msgs)
          setLoading(false)
        },
      })
      .then((msgs) => {
        if (!alive) return
        clearUiTimeout()
        setMessages(msgs)
        setLoading(false)
      })
      .catch((err) => {
        if (!alive) return
        clearUiTimeout()
        setError(err instanceof Error ? err.message : t('dm.loadError'))
        setLoading(false)
      })

    const since = Math.floor(Date.now() / 1000) - 60

    function onIncomingDm(fromMe: boolean, evt: Event) {
      try {
        const decryptedContent = client.decryptDM(evt)
        const newMessage: DecryptedDM = { event: evt, decryptedContent, isFromMe: fromMe }
        if (!alive) return
        setMessages((prev) => mergeIncomingDm(prev, newMessage, fromMe))
      } catch (e) {
        console.error('Failed to decrypt DM:', e)
      }
    }

    const unsub = client.subscribeGrouped(
      [
        { kinds: [4], authors: [me], since, limit: 200 },
        { kinds: [4], authors: [peer], '#p': [me], since },
      ],
      {
        onevent: (evt) => {
          if (blockedPubkeys.some((b) => b.toLowerCase() === peer)) return
          const author = evt.pubkey.toLowerCase()
          if (author === me) {
            const p = evt.tags
              .find((t) => t[0] === 'p' && typeof t[1] === 'string')?.[1]
              ?.toLowerCase()
            if (p !== peer) return
            onIncomingDm(true, evt)
          } else if (author === peer) {
            onIncomingDm(false, evt)
          }
        },
      },
      'dm-live',
    )

    return () => {
      alive = false
      clearUiTimeout()
      unsub()
    }
  }, [open, peer, myPubkey, client, t, blockedPubkeys])

  useEffect(() => {
    if (open && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open, messages])

  async function sendMessage() {
    const content = messageText.trim()
    if (!content || sending) return

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError(t('dm.offlineSend'))
      return
    }

    setSending(true)
    setError(null)

    const tempId = `temp-${Date.now()}`
    const optimisticMessage: DecryptedDM = {
      event: {
        id: tempId,
        pubkey: myPubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 4,
        tags: [['p', peer]],
        content: t('dm.sendingContent'),
        sig: '',
      },
      decryptedContent: content,
      isFromMe: true,
    }
    setMessages((prev) => sortDms([...prev, optimisticMessage]))

    try {
      await client.sendDM(peer, content)
      setMessageText('')
      window.setTimeout(() => {
        setMessages((prev) => {
          const hasRealMessage = prev.some(
            (m) => m.event.id !== tempId && m.isFromMe && m.decryptedContent === content,
          )
          if (!hasRealMessage) return prev
          return prev.filter((m) => m.event.id !== tempId)
        })
      }, 5000)
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.event.id !== tempId))
      setError(e instanceof Error ? e.message : t('dm.sendError'))
    } finally {
      setSending(false)
    }
  }

  function handleOpenBlockFlow() {
    setShowReportField(true)
  }

  async function handleConfirmBlock() {
    if (isOffline) {
      showToast(t('thread.offlineBlock'), 'error')
      return
    }
    setBlockState('blocking')
    try {
      if (reportReason.trim()) {
        await client.publish({
          kind: NOSTR_KINDS.report,
          content: reportReason.trim(),
          tags: [['p', peer]],
        })
      }
      await onBlockUser(peer)
      setBlockState('idle')
      setShowReportField(false)
      setReportReason('')
      showToast(t('thread.userBlocked'))
      onClose()
    } catch (e) {
      setBlockState('idle')
      showToast(e instanceof Error ? e.message : t('thread.blockingFailed'), 'error')
    }
  }

  const dmTitle = `${t('dm.titlePrefix')} ${shortNpub(nip19.npubEncode(otherPubkey), 8, 4)}`

  return (
    <Sheet
      open={open}
      titleElement={
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 pr-2">
          <div className="min-w-0 truncate text-sm font-semibold">{dmTitle}</div>
          {!isBlocked && !showReportField ? (
            <button
              type="button"
              onClick={handleOpenBlockFlow}
              disabled={blockState === 'blocking'}
              aria-label={t('thread.blockUserAria')}
              title={t('thread.blockUserTitle')}
              className={`shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${buttonBase}`}
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                aria-hidden="true"
                className="opacity-90"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
              <span>{blockState === 'blocking' ? '…' : t('thread.block')}</span>
            </button>
          ) : null}
        </div>
      }
      onClose={onClose}
      bodyVariant="fill"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {showReportField && !isBlocked ? (
          <div className="mb-3 shrink-0 space-y-2 rounded-lg border border-brezn-border bg-brezn-panel p-3">
            <div className="text-xs font-semibold text-brezn-muted">
              {t('thread.blockHeading', { label: shortNpub(nip19.npubEncode(otherPubkey), 8, 4) })}
            </div>
            <div className="text-xs text-brezn-text">{t('thread.reportHint')}</div>
            <textarea
              ref={reportTextareaRef}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder={t('thread.reportReason')}
              className="w-full min-h-[72px] resize-none border border-brezn-text p-2 text-base outline-none"
              disabled={blockState === 'blocking' || isOffline}
            />
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void handleConfirmBlock()}
                disabled={blockState === 'blocking' || isOffline}
                className={`w-1/2 rounded-xl px-3 py-2 text-xs font-semibold ${buttonBase}`}
              >
                {blockState === 'blocking' ? t('thread.blocking') : t('thread.block')}
              </button>
            </div>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex min-h-full flex-col items-center justify-center gap-2 px-1 py-8 text-center text-sm text-brezn-muted">
              {t('dm.loading')}
            </div>
          ) : error && messages.length === 0 ? (
            <div className="flex min-h-full flex-col items-center justify-center px-1 py-8 text-center text-sm text-brezn-error">
              {error}
            </div>
          ) : !error && messages.length === 0 ? (
            <div className="flex min-h-full flex-col items-center justify-center gap-2 px-1 py-8 text-center text-sm text-brezn-muted">
              {t('dm.empty')}
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {error ? (
                <div className="rounded-lg border border-brezn-border bg-brezn-panel px-3 py-2 text-center text-xs text-brezn-error">
                  {error}
                </div>
              ) : null}
              {messages.map((msg) => {
                const peerHidden =
                  !msg.isFromMe &&
                  mutedTerms.length > 0 &&
                  contentMatchesMutedTerms(msg.decryptedContent, mutedTerms)
                return (
                  <div
                    key={msg.event.id}
                    className={`flex ${msg.isFromMe ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[62%] rounded-lg px-4 py-2 ${
                        msg.isFromMe
                          ? 'bg-brezn-button text-brezn-text'
                          : 'bg-brezn-panel border border-brezn-border'
                      }`}
                    >
                      <div
                        className={`text-sm whitespace-pre-wrap break-words ${
                          peerHidden ? 'italic text-brezn-muted' : ''
                        }`}
                      >
                        {peerHidden ? t('dm.hiddenByBlocklist') : msg.decryptedContent}
                      </div>
                      <div className="mt-1 text-[10px] text-brezn-text">
                        {formatRelativeChatTime(t, msg.event.created_at)}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-brezn-border bg-brezn-panel pt-3">
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void sendMessage()
                }
              }}
              placeholder={t('dm.placeholder')}
              className="basis-[62%] h-20 resize-none border border-brezn-text p-3 text-base outline-none"
              disabled={sending || showReportField}
            />
            <button
              onClick={sendMessage}
              disabled={sending || !messageText.trim() || showReportField}
              aria-label={t('dm.sendAria')}
              className={`basis-[38%] rounded-lg px-4 py-3 text-sm font-semibold ${buttonBase}`}
            >
              {sending ? '…' : '→'}
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  )
}
