import { useEffect, useMemo, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { nip19, type Event } from '../lib/nostrPrimitives'
import type { BreznNostrClient } from '../lib/nostrClient'
import type { GeoPoint } from '../lib/geo'
import { calculateApproxDistance } from '../lib/geo'
import { buttonBase, reactionButtonClasses } from '../lib/buttonStyles'
import { NOSTR_KINDS } from '../lib/breznNostr'
import { useReplies } from '../hooks/useReplies'
import { useProfiles, type Profile } from '../hooks/useProfiles'
import { useToast } from './ToastContext'
import { Sheet } from './Sheet'
import { PostContent } from './PostContent'
import { PostIdentity } from './PostIdentity'
import { feedEventCardPlainText } from '../lib/feedContentPreview'
import { formatEventCardTimestamp, shortNpub } from '../lib/nostrUtils'
import { sheetPostCardClass } from '../lib/uiClasses'
import { HeartIcon } from './HeartIcon'

function PostCard(props: {
  evt: Event
  viewerPoint: GeoPoint | null
  client: BreznNostrClient
  profile?: { pubkey: string; name?: string; picture?: string; about?: string }
  onOpenProfile?: (pubkey: string) => void
  onOpenThread?: (evt: Event) => void
}) {
  const { evt, viewerPoint, profile, onOpenProfile, client, onOpenThread } = props
  const dist = calculateApproxDistance(evt, viewerPoint)
  return (
    <article className={sheetPostCardClass}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <PostIdentity
            pubkey={evt.pubkey}
            profile={profile}
            onClick={onOpenProfile ? () => onOpenProfile(evt.pubkey) : undefined}
            onAvatarClick={onOpenProfile ? () => onOpenProfile(evt.pubkey) : undefined}
            avatarSize="large"
          />
        </div>
        <div className="shrink-0 text-[11px] text-brezn-text">
          {formatEventCardTimestamp(evt.created_at)}
          {dist ? <span> / {dist}</span> : null}
        </div>
      </div>
      <div className="mt-2">
        <PostContent
          content={feedEventCardPlainText(evt)}
          tags={evt.tags}
          linkMedia
          mediaStacked
          client={client}
          onOpenThread={onOpenThread}
          onOpenProfile={onOpenProfile}
        />
      </div>
    </article>
  )
}

export function ThreadSheet(props: {
  open: boolean
  onClose: () => void
  root: Event
  /** From App (feed + thread root); merged with thread-specific profile fetch. */
  feedProfilesByPubkey: Map<string, Profile>
  client: BreznNostrClient
  mutedTerms: string[]
  blockedPubkeys: string[]
  isOffline: boolean
  viewerPoint: GeoPoint | null
  onPublishReply: (content: string) => Promise<void> | void
  onDelete?: (evt: Event, childOwnEvents?: Event[]) => Promise<void> | void
  onBlockUser?: (pubkey: string) => Promise<void> | void
  reactionsByNoteId: Record<string, { total: number; viewerReacted: boolean }>
  canReact: boolean
  onReact: (evt: Event) => void
  onThreadRepliesChange?: (noteIds: string[]) => void
  onOpenProfile?: (pubkey: string) => void
  onOpenThread?: (evt: Event) => void
}) {
  const {
    open,
    onClose,
    root,
    feedProfilesByPubkey,
    client,
    mutedTerms,
    blockedPubkeys,
    isOffline,
    viewerPoint,
    onPublishReply,
    onDelete,
    onBlockUser,
    reactionsByNoteId,
    canReact,
    onReact,
    onThreadRepliesChange,
    onOpenProfile,
    onOpenThread,
  } = props
  const { t } = useTranslation()
  const { showToast } = useToast()

  const { replies } = useReplies({
    client,
    rootId: root.id,
    mutedTerms,
    blockedPubkeys,
    isOffline,
  })

  useEffect(() => {
    onThreadRepliesChange?.(replies.map((r) => r.id))
  }, [replies, onThreadRepliesChange])

  const replyCount = replies.length

  const allPubkeys = useMemo(
    () => [root.pubkey, ...replies.map((r) => r.pubkey)],
    [root.pubkey, replies],
  )
  const { profilesByPubkey: subProfilesByPubkey } = useProfiles({
    client,
    pubkeys: allPubkeys,
    isOffline,
  })
  const profilesByPubkey = useMemo(() => {
    const out = new Map<string, Profile>()
    for (const pk of allPubkeys) {
      const s = subProfilesByPubkey.get(pk)
      const f = feedProfilesByPubkey.get(pk)
      if (!f) {
        if (s) out.set(pk, s)
        continue
      }
      if (!s) {
        out.set(pk, f)
        continue
      }
      out.set(pk, {
        pubkey: pk,
        name: s.name ?? f.name,
        picture: s.picture ?? f.picture,
        about: s.about ?? f.about,
      })
    }
    return out
  }, [allPubkeys, subProfilesByPubkey, feedProfilesByPubkey])

  const [text, setText] = useState('')
  const [publishState, setPublishState] = useState<'idle' | 'publishing' | 'error'>('idle')
  const [publishError, setPublishError] = useState<string | null>(null)

  async function publish() {
    const content = text.trim()
    if (!content) return
    if (isOffline) {
      setPublishState('error')
      setPublishError(t('app.offlineComments'))
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
      setPublishError(e instanceof Error ? e.message : t('thread.publishFailedFallback'))
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
      setDeleteError(t('app.offlineDelete'))
      return
    }
    setDeleteState('deleting')
    setDeleteError(null)
    try {
      const ownReplies = replies.filter((reply) => reply.pubkey === identity.pubkey)
      await onDelete(root, ownReplies)
      setDeleteState('idle')
      onClose()
    } catch (e) {
      setDeleteState('error')
      setDeleteError(e instanceof Error ? e.message : t('thread.deleteFailed'))
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
      showToast(t('thread.offlineBlock'), 'error')
      return
    }

    setBlockState('blocking')
    try {
      // Send NIP-56 report event if reason is provided
      if (reportReason.trim()) {
        const tags: string[][] = [
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
      showToast(t('thread.userBlocked'))
      onClose()
    } catch (e) {
      setBlockState('idle')
      const msg = e instanceof Error ? e.message : t('thread.blockingFailed')
      showToast(msg, 'error')
    }
  }

  function handleBlockReply(replyId: string) {
    if (!onBlockUser) return
    setReportingReplyId(replyId)
  }

  async function handleBlockReplyWithReport(reply: Event) {
    if (!onBlockUser) return
    if (isOffline) {
      showToast(t('thread.offlineBlock'), 'error')
      return
    }

    setBlockState('blocking')
    try {
      // Send NIP-56 report event if reason is provided
      if (replyReportReason.trim()) {
        const tags: string[][] = [
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
      showToast(t('thread.userBlocked'))
    } catch (e) {
      setBlockState('idle')
      const msg = e instanceof Error ? e.message : t('thread.blockingFailed')
      showToast(msg, 'error')
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
            aria-label={t('thread.sendDeletionAria')}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${buttonBase}`}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden="true"
              className="opacity-90"
            >
              <path
                fill="currentColor"
                d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
              />
            </svg>
            <span>
              {deleteState === 'deleting' ? t('thread.deleteSending') : t('thread.delete')}
            </span>
          </button>
        ) : !isOwnPost && onBlockUser && !isBlocked && !showReportField ? (
          <button
            type="button"
            onClick={() => void handleBlockUser()}
            disabled={blockState === 'blocking'}
            aria-label={t('thread.blockUserAria')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${buttonBase}`}
            title={t('thread.blockUserTitle')}
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
        ) : null
      }
      onClose={onClose}
    >
      <div className="space-y-3">
        {deleteState === 'error' && deleteError ? (
          <div className="rounded-lg border border-brezn-border bg-brezn-panel p-3 text-sm text-brezn-error">
            {deleteError}
          </div>
        ) : null}
        {/* Show post and interactions, or show report field */}
        {showReportField && !isOwnPost && onBlockUser && !isBlocked ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-brezn-muted">
              {t('thread.blockHeading', { label: shortNpub(nip19.npubEncode(root.pubkey), 8, 4) })}
            </div>
            <div className="text-xs text-brezn-text">{t('thread.reportHint')}</div>
            <textarea
              ref={reportTextareaRef}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder={t('thread.reportReason')}
              className="w-full min-h-[80px] resize-none border border-brezn-text p-2 text-base outline-none"
              disabled={blockState === 'blocking' || isOffline}
            />
            <div className="flex justify-center">
              <button
                onClick={() => void handleBlock()}
                disabled={blockState === 'blocking' || isOffline}
                className={`w-1/2 rounded-xl px-3 py-2 text-xs font-semibold ${buttonBase}`}
              >
                {blockState === 'blocking' ? t('thread.blocking') : t('thread.block')}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <PostCard
              evt={root}
              viewerPoint={viewerPoint}
              client={client}
              profile={profilesByPubkey.get(root.pubkey)}
              onOpenProfile={onOpenProfile}
              onOpenThread={onOpenThread}
            />
            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs font-semibold text-brezn-muted">
                {t('thread.replies', { count: replyCount })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onReact(root)}
                  disabled={!canReact || Boolean(reactionsByNoteId[root.id]?.viewerReacted)}
                  className={reactionButtonClasses(
                    Boolean(reactionsByNoteId[root.id]?.viewerReacted),
                    canReact,
                  )}
                  aria-label={
                    reactionsByNoteId[root.id]?.total
                      ? t('feedArticle.sendReactionCount', {
                          count: reactionsByNoteId[root.id]?.total ?? 0,
                        })
                      : t('feedArticle.sendReaction')
                  }
                >
                  <HeartIcon liked={Boolean(reactionsByNoteId[root.id]?.viewerReacted)} />
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
                <div className="mb-2 text-[11px] text-brezn-muted">{t('thread.offline')}</div>
              ) : null}
              {replies.length ? (
                <div className="space-y-2">
                  {replies.map((r) => {
                    const replyProfile = profilesByPubkey.get(r.pubkey)
                    const isReplyOwnPost = r.pubkey === identity.pubkey
                    const isReplyBlocked = blockedPubkeys.includes(r.pubkey)
                    const isReportingReply = reportingReplyId === r.id
                    return (
                      <div key={r.id} className="space-y-2">
                        {isReportingReply && !isReplyOwnPost && onBlockUser && !isReplyBlocked ? (
                          <div className="space-y-2 rounded-lg border border-brezn-border bg-brezn-panel p-3">
                            <div className="text-xs font-semibold text-brezn-muted">
                              {t('thread.blockHeading', {
                                label: shortNpub(nip19.npubEncode(r.pubkey), 8, 4),
                              })}
                            </div>
                            <div className="text-xs text-brezn-text">{t('thread.reportHint')}</div>
                            <textarea
                              ref={replyReportTextareaRef}
                              value={replyReportReason}
                              onChange={(e) => setReplyReportReason(e.target.value)}
                              placeholder={t('thread.reportReason')}
                              className="w-full min-h-[80px] resize-none border border-brezn-text p-2 text-base outline-none"
                              disabled={blockState === 'blocking' || isOffline}
                            />
                            <div className="flex justify-center">
                              <button
                                onClick={() => void handleBlockReplyWithReport(r)}
                                disabled={blockState === 'blocking' || isOffline}
                                className={`w-1/2 rounded-xl px-3 py-2 text-xs font-semibold ${buttonBase}`}
                              >
                                {blockState === 'blocking'
                                  ? t('thread.blocking')
                                  : t('thread.block')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <article className={sheetPostCardClass}>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-6 min-w-0 flex-1">
                                <PostIdentity
                                  pubkey={r.pubkey}
                                  profile={replyProfile}
                                  onClick={
                                    onOpenProfile ? () => onOpenProfile(r.pubkey) : undefined
                                  }
                                  onAvatarClick={
                                    onOpenProfile ? () => onOpenProfile(r.pubkey) : undefined
                                  }
                                  avatarSize="large"
                                />
                                {!isReplyOwnPost && onBlockUser && !isReplyBlocked ? (
                                  <button
                                    type="button"
                                    onClick={() => handleBlockReply(r.id)}
                                    disabled={blockState === 'blocking' || isOffline}
                                    aria-label={t('thread.blockUserAria')}
                                    className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold ${buttonBase}`}
                                    title={t('thread.blockUserTitle')}
                                  >
                                    <svg
                                      viewBox="0 0 24 24"
                                      width="12"
                                      height="12"
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
                                  </button>
                                ) : null}
                              </div>
                              <span className="shrink-0 text-[11px] text-brezn-text">
                                {new Date(r.created_at * 1000).toLocaleString()}
                                {(() => {
                                  const dist = viewerPoint
                                    ? calculateApproxDistance(r, viewerPoint)
                                    : null
                                  return dist ? <span> / {dist}</span> : null
                                })()}
                              </span>
                            </div>
                            <div className="mt-2 flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <PostContent
                                  content={r.content}
                                  tags={r.tags}
                                  linkMedia
                                  mediaStacked
                                  client={client}
                                  onOpenThread={onOpenThread}
                                  onOpenProfile={onOpenProfile}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => onReact(r)}
                                disabled={
                                  !canReact || Boolean(reactionsByNoteId[r.id]?.viewerReacted)
                                }
                                className={`shrink-0 ${reactionButtonClasses(
                                  Boolean(reactionsByNoteId[r.id]?.viewerReacted),
                                  canReact,
                                )}`}
                                aria-label={
                                  reactionsByNoteId[r.id]?.total
                                    ? t('feedArticle.sendReactionCount', {
                                        count: reactionsByNoteId[r.id]?.total ?? 0,
                                      })
                                    : t('feedArticle.sendReaction')
                                }
                              >
                                <HeartIcon
                                  liked={Boolean(reactionsByNoteId[r.id]?.viewerReacted)}
                                />
                                <span className="font-mono">
                                  {reactionsByNoteId[r.id]?.total ?? 0}
                                </span>
                              </button>
                            </div>
                          </article>
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
                onChange={(e) => setText(e.target.value)}
                placeholder={t('thread.replyPlaceholder')}
                className="mt-2 h-24 w-full resize-none border border-brezn-text p-3 text-base outline-none"
                disabled={isOffline}
              />
              {publishState === 'error' && publishError ? (
                <div className="mt-2 text-sm text-brezn-error">{publishError}</div>
              ) : null}
              <div className="mt-2 flex justify-center">
                <button
                  onClick={() => void publish()}
                  disabled={publishState === 'publishing' || !text.trim() || isOffline}
                  className={`w-1/2 rounded-lg px-4 py-3 text-sm font-semibold ${buttonBase}`}
                >
                  {publishState === 'publishing' ? t('thread.replySending') : t('thread.reply')}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Sheet>
  )
}
