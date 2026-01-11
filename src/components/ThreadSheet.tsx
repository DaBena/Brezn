import { useEffect, useMemo, useState, useRef } from 'react'
import type { Event } from 'nostr-tools'
import type { BreznNostrClient } from '../lib/nostrClient'
import type { GeoPoint } from '../lib/geo'
import { calculateApproxDistance } from '../lib/geo'
import { buttonBase, buttonDanger, reactionButtonClasses } from '../lib/buttonStyles'
import { breznClientTag, NOSTR_KINDS } from '../lib/breznNostr'
import { useReplies } from '../hooks/useReplies'
import { useProfiles } from '../hooks/useProfiles'
import { useToast } from './Toast'
import { Sheet } from './Sheet'
import { PostContent } from './PostContent'
import { PostIdentity } from './PostIdentity'
import { shortNpub } from '../lib/nostrUtils'
import * as nip19 from 'nostr-tools/nip19'

function PostCard(props: {
  evt: Event
  viewerPoint: GeoPoint | null
  profile?: { pubkey: string; name?: string; picture?: string }
  onOpenChat?: (pubkey: string) => void
}) {
  const { evt, viewerPoint, profile, onOpenChat } = props
  const dist = calculateApproxDistance(evt, viewerPoint)
  return (
    <article className="rounded-lg bg-brezn-panel2 p-3 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <PostIdentity 
            pubkey={evt.pubkey} 
            profile={profile}
            onClick={onOpenChat ? () => onOpenChat(evt.pubkey) : undefined}
          />
        </div>
        <div className="shrink-0 text-[11px] text-brezn-muted">
          {new Date(evt.created_at * 1000).toLocaleString()}
          {dist ? <span> / {dist}</span> : null}
        </div>
      </div>
      <div className="mt-2">
        <PostContent content={evt.content} linkMedia />
      </div>
    </article>
  )
}

export function ThreadSheet(props: {
  open: boolean
  onClose: () => void
  root: Event
  client: BreznNostrClient
  mutedTerms: string[]
  blockedPubkeys: string[]
  isOffline: boolean
  viewerPoint: GeoPoint | null
  onPublishReply: (content: string) => Promise<void> | void
  onDelete?: (evt: Event) => Promise<void> | void
  onBlockUser?: (pubkey: string) => Promise<void> | void
  reactionsByNoteId: Record<string, { total: number; viewerReacted: boolean }>
  canReact: boolean
  onReact: (evt: Event) => void
  onOpenChat?: (pubkey: string) => void
}) {
  const { open, onClose, root, client, mutedTerms, blockedPubkeys, isOffline, viewerPoint, onPublishReply, onDelete, onBlockUser, reactionsByNoteId, canReact, onReact, onOpenChat } = props
  const { showToast } = useToast()

  const { replies } = useReplies({ client, rootId: root.id, mutedTerms, blockedPubkeys, isOffline })

  const replyCount = replies.length

  const allPubkeys = useMemo(() => [root.pubkey, ...replies.map(r => r.pubkey)], [root.pubkey, replies])
  const { profilesByPubkey } = useProfiles({ client, pubkeys: allPubkeys, isOffline })

  const [text, setText] = useState('')
  const [publishState, setPublishState] = useState<'idle' | 'publishing' | 'error'>('idle')
  const [publishError, setPublishError] = useState<string | null>(null)

  async function publish() {
    const content = text.trim()
    if (!content) return
    if (isOffline) {
      setPublishState('error')
      setPublishError('Offline - Comments are read-only.')
      return
    }
    setPublishState('publishing')
    setPublishError(null)
    try {
      await onPublishReply(content)
      setText('')
      setPublishState('idle')
    } catch (e) {
      setPublishState('error')
      setPublishError(e instanceof Error ? e.message : 'Publish failed.')
    }
  }

  const identity = client.getPublicIdentity()
  const isOwnPost = root.pubkey === identity.pubkey
  const isBlocked = blockedPubkeys.includes(root.pubkey)

  const [deleteState, setDeleteState] = useState<'idle' | 'deleting' | 'error'>('idle')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [blockState, setBlockState] = useState<'idle' | 'blocking'>('idle')
  const [showReportField, setShowReportField] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const reportTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [reportingReplyId, setReportingReplyId] = useState<string | null>(null)
  const [replyReportReason, setReplyReportReason] = useState('')
  const replyReportTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Automatically close thread if the user is blocked
  useEffect(() => {
    if (isBlocked && !isOwnPost) {
      onClose()
    }
  }, [isBlocked, isOwnPost, onClose])

  // Focus textarea when report field is shown
  useEffect(() => {
    if (showReportField && reportTextareaRef.current) {
      reportTextareaRef.current.focus()
    }
  }, [showReportField])

  async function handleDelete() {
    if (!onDelete) return
    if (isOffline) {
      setDeleteState('error')
      setDeleteError('Offline - Deletion event cannot be sent.')
      return
    }
    if (!window.confirm('Send NIP-09 deletion event? This marks the post as deleted (clients may still display it).')) {
      return
    }
    setDeleteState('deleting')
    setDeleteError(null)
    try {
      await onDelete(root)
      setDeleteState('idle')
      onClose()
    } catch (e) {
      setDeleteState('error')
      setDeleteError(e instanceof Error ? e.message : 'Deletion event failed.')
    }
  }

  async function handleBlockUser() {
    if (!onBlockUser) return
    if (isOwnPost) return
    if (isBlocked) return
    // Show report field and hide post
    setShowReportField(true)
  }

  async function handleBlock() {
    if (!onBlockUser) return
    if (isOffline) {
      showToast('Offline - Cannot block user.', 'error')
      return
    }
    
    setBlockState('blocking')
    try {
      // Send NIP-56 report event if reason is provided
      if (reportReason.trim()) {
        const tags: string[][] = [
          breznClientTag(),
          ['p', root.pubkey],
          ['e', root.id],
        ]
        await client.publish({
          kind: NOSTR_KINDS.report,
          content: reportReason.trim(), // NIP-56: Report reason goes in content field
          tags,
        })
      }
      
      // Block the user
      await onBlockUser(root.pubkey)
      setBlockState('idle')
      setShowReportField(false)
      setReportReason('') // Resetting UI state (report was already sent if reason was provided)
      showToast('User blocked.', 'success')
      onClose()
    } catch (e) {
      setBlockState('idle')
      showToast(e instanceof Error ? e.message : 'Blocking failed.', 'error')
    }
  }

  function handleBlockReply(replyId: string) {
    if (!onBlockUser) return
    setReportingReplyId(replyId)
  }

  async function handleBlockReplyWithReport(reply: Event) {
    if (!onBlockUser) return
    if (isOffline) {
      showToast('Offline - Cannot block user.', 'error')
      return
    }
    
    setBlockState('blocking')
    try {
      // Send NIP-56 report event if reason is provided
      if (replyReportReason.trim()) {
        const tags: string[][] = [
          breznClientTag(),
          ['p', reply.pubkey],
          ['e', reply.id],
        ]
        await client.publish({
          kind: NOSTR_KINDS.report,
          content: replyReportReason.trim(), // NIP-56: Report reason goes in content field
          tags,
        })
      }
      
      // Block the user
      await onBlockUser(reply.pubkey)
      setBlockState('idle')
      setReportingReplyId(null)
      setReplyReportReason('') // Resetting UI state (report was already sent if reason was provided)
      showToast('User blocked.', 'success')
    } catch (e) {
      setBlockState('idle')
      showToast(e instanceof Error ? e.message : 'Blocking failed.', 'error')
    }
  }

  return (
    <Sheet
      open={open}
      titleElement={
        isOwnPost && onDelete ? (
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleteState === 'deleting' || isOffline}
            aria-label="Send NIP-09 deletion event"
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${buttonDanger}`}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="opacity-90">
              <path
                fill="currentColor"
                d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
              />
            </svg>
            <span>{deleteState === 'deleting' ? 'Sending…' : 'Delete'}</span>
          </button>
        ) : !isOwnPost && onBlockUser && !isBlocked && !showReportField ? (
          <button
            type="button"
            onClick={() => void handleBlockUser()}
            disabled={blockState === 'blocking'}
            aria-label="Block user"
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${buttonDanger}`}
            title="Block user"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="opacity-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
            <span>{blockState === 'blocking' ? '…' : 'Block'}</span>
          </button>
        ) : null
      }
      onClose={onClose}
    >
      <div className="space-y-3">
        {deleteState === 'error' && deleteError ? (
          <div className="rounded-lg border border-brezn-border bg-brezn-panel2 p-3 text-sm text-brezn-danger">
            {deleteError}
          </div>
        ) : null}
        {/* Show post and interactions, or show report field */}
        {showReportField && !isOwnPost && onBlockUser && !isBlocked ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-brezn-muted">
              Block {shortNpub(nip19.npubEncode(root.pubkey), 8, 4)}
            </div>
            <div className="text-xs text-brezn-text">
              Optional: Provide a reason for reporting this user. This will be sent to relays via NIP-56.
            </div>
            <textarea
              ref={reportTextareaRef}
              value={reportReason}
              onChange={e => setReportReason(e.target.value)}
              placeholder="Reason for reporting (optional)"
              className="w-full min-h-[80px] resize-none border border-brezn-border bg-brezn-panel p-2 text-sm outline-none"
              disabled={blockState === 'blocking' || isOffline}
            />
            <div className="flex justify-center">
              <button
                onClick={() => void handleBlock()}
                disabled={blockState === 'blocking' || isOffline}
                className={`w-1/2 rounded-xl px-3 py-2 text-xs font-semibold ${buttonBase}`}
              >
                {blockState === 'blocking' ? 'Blocking…' : 'Block'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <PostCard evt={root} viewerPoint={viewerPoint} profile={profilesByPubkey.get(root.pubkey)} onOpenChat={onOpenChat} />
            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs font-semibold text-brezn-muted">Replies ({replyCount})</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onReact(root)}
                  disabled={!canReact || Boolean(reactionsByNoteId[root.id]?.viewerReacted)}
                  className={reactionButtonClasses(
                    Boolean(reactionsByNoteId[root.id]?.viewerReacted),
                    canReact
                  )}
                  aria-label={`Send reaction${reactionsByNoteId[root.id]?.total ? ` (${reactionsByNoteId[root.id]?.total})` : ''}`}
                >
                  <span aria-hidden="true">👍</span>
                  <span className="font-mono">{reactionsByNoteId[root.id]?.total ?? 0}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hide replies and reply input when report field is shown */}
        {!showReportField ? (
          <>
            <div>
              {isOffline ? (
                <div className="mb-2 text-[11px] text-brezn-muted">Offline</div>
              ) : null}
              {replies.length ? (
                <div className="space-y-2">
                  {replies.map(r => {
                    const replyProfile = profilesByPubkey.get(r.pubkey)
                    const isReplyOwnPost = r.pubkey === identity.pubkey
                    const isReplyBlocked = blockedPubkeys.includes(r.pubkey)
                    const isReportingReply = reportingReplyId === r.id
                    return (
                      <div key={r.id} className="space-y-2">
                        {isReportingReply && !isReplyOwnPost && onBlockUser && !isReplyBlocked ? (
                          <div className="space-y-2 rounded-lg border border-brezn-border bg-brezn-panel2 p-3">
                            <div className="text-xs font-semibold text-brezn-muted">
                              Block {shortNpub(nip19.npubEncode(r.pubkey), 8, 4)}
                            </div>
                            <div className="text-xs text-brezn-text">
                              Optional: Provide a reason for reporting this user. This will be sent to relays via NIP-56.
                            </div>
                            <textarea
                              ref={replyReportTextareaRef}
                              value={replyReportReason}
                              onChange={e => setReplyReportReason(e.target.value)}
                              placeholder="Reason for reporting (optional)"
                              className="w-full min-h-[80px] resize-none border border-brezn-border bg-brezn-panel p-2 text-sm outline-none"
                              disabled={blockState === 'blocking' || isOffline}
                            />
                            <div className="flex justify-center">
                              <button
                                onClick={() => void handleBlockReplyWithReport(r)}
                                disabled={blockState === 'blocking' || isOffline}
                                className={`w-1/2 rounded-xl px-3 py-2 text-xs font-semibold ${buttonBase}`}
                              >
                                {blockState === 'blocking' ? 'Blocking…' : 'Block'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <PostCard evt={r} viewerPoint={viewerPoint} profile={replyProfile} onOpenChat={onOpenChat} />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => onReact(r)}
                                disabled={!canReact || Boolean(reactionsByNoteId[r.id]?.viewerReacted)}
                                className={reactionButtonClasses(
                                  Boolean(reactionsByNoteId[r.id]?.viewerReacted),
                                  canReact
                                )}
                                aria-label={`Send reaction${reactionsByNoteId[r.id]?.total ? ` (${reactionsByNoteId[r.id]?.total})` : ''}`}
                              >
                                <span aria-hidden="true">👍</span>
                                <span className="font-mono">{reactionsByNoteId[r.id]?.total ?? 0}</span>
                              </button>
                              {!isReplyOwnPost && onBlockUser && !isReplyBlocked ? (
                                <button
                                  type="button"
                                  onClick={() => handleBlockReply(r.id)}
                                  disabled={blockState === 'blocking' || isOffline}
                                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold ${buttonDanger}`}
                                  title="Block user"
                                >
                                  <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" className="opacity-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"/>
                                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                                  </svg>
                                </button>
                              ) : null}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>

            <div className="-mx-4 mt-3 bg-brezn-panel px-4 pb-[env(safe-area-inset-bottom)] pt-3">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Write reply…"
                className="mt-2 h-24 w-full resize-none border border-brezn-border bg-brezn-panel2 p-3 text-sm outline-none"
                disabled={isOffline}
              />
              {publishState === 'error' && publishError ? <div className="mt-2 text-sm text-brezn-danger">{publishError}</div> : null}
              <div className="mt-2 flex justify-center">
                <button
                  onClick={() => void publish()}
                  disabled={publishState === 'publishing' || !text.trim() || isOffline}
                  className={`w-1/2 rounded-lg px-4 py-3 text-sm font-semibold ${buttonBase}`}
                >
                  {publishState === 'publishing' ? 'Sending…' : 'Reply'}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Sheet>
  )
}

