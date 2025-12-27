import { useEffect, useMemo, useState } from 'react'
import type { Event } from 'nostr-tools'
import type { BreznNostrClient } from '../lib/nostrClient'
import type { GeoPoint } from '../lib/geo'
import { decodeGeohashCenter, formatApproxDistance, haversineDistanceKm } from '../lib/geo'
import { getLongestGeohashTag } from '../lib/nostrUtils'
import { useReplies } from '../hooks/useReplies'
import { useProfiles } from '../hooks/useProfiles'
import { Sheet } from './Sheet'
import { PostContent } from './PostContent'
import { PostIdentity } from './PostIdentity'

function approxDistanceForEvt(evt: Event, viewerPoint: GeoPoint | null): string | null {
  if (!viewerPoint) return null
  // Use the longest (most precise) geohash tag for accurate distance calculation
  const g = getLongestGeohashTag(evt)
  if (!g) return null
  const p = decodeGeohashCenter(g)
  if (!p) return null
  const km = haversineDistanceKm(viewerPoint, p)
  const label = formatApproxDistance(km, g.length)
  return label || null
}

function PostCard(props: {
  evt: Event
  viewerPoint: GeoPoint | null
  profile?: { pubkey: string; name?: string; picture?: string }
}) {
  const { evt, viewerPoint, profile } = props
  const dist = approxDistanceForEvt(evt, viewerPoint)
  return (
    <article className="rounded-2xl border border-brezn-border bg-brezn-panel2 p-3 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <PostIdentity pubkey={evt.pubkey} profile={profile} />
        </div>
        <div className="shrink-0 text-[11px] text-brezn-muted">
          {new Date(evt.created_at * 1000).toLocaleString('de-DE')}
          {dist ? <span> / {dist}</span> : null}
        </div>
      </div>
      <div className="mt-2">
        <PostContent content={evt.content} />
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
  onBlockUser?: (pubkey: string) => void
}) {
  const { open, onClose, root, client, mutedTerms, blockedPubkeys, isOffline, viewerPoint, onPublishReply, onDelete, onBlockUser } = props

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
      setPublishError('Offline – Kommentare sind read-only.')
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

  // Automatically close thread if the user is blocked
  useEffect(() => {
    if (isBlocked && !isOwnPost) {
      onClose()
    }
  }, [isBlocked, isOwnPost, onClose])

  const [deleteState, setDeleteState] = useState<'idle' | 'deleting' | 'error'>('idle')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [blockState, setBlockState] = useState<'idle' | 'blocking'>('idle')

  async function handleDelete() {
    if (!onDelete) return
    if (isOffline) {
      setDeleteState('error')
      setDeleteError('Offline – Deletion Event kann nicht gesendet werden.')
      return
    }
    if (!window.confirm('NIP-09 Deletion Event senden? Dies markiert den Post als gelöscht (Clients können ihn weiterhin anzeigen).')) {
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
      setDeleteError(e instanceof Error ? e.message : 'Deletion Event fehlgeschlagen.')
    }
  }

  function handleBlockUser() {
    if (!onBlockUser) return
    if (isOwnPost) return
    if (isBlocked) return
    if (!window.confirm('Diesen Nutzer blockieren? Alle Posts von diesem Nutzer werden ausgeblendet.')) {
      return
    }
    setBlockState('blocking')
    try {
      onBlockUser(root.pubkey)
      setBlockState('idle')
      onClose()
    } catch (e) {
      setBlockState('idle')
      window.alert(e instanceof Error ? e.message : 'Blockieren fehlgeschlagen.')
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
            aria-label="NIP-09 Deletion Event senden"
            className="flex items-center gap-2 rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-xs font-semibold text-brezn-danger hover:opacity-90 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="opacity-90">
              <path
                fill="currentColor"
                d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
              />
            </svg>
            <span>{deleteState === 'deleting' ? 'Sende…' : 'Deletion Event'}</span>
          </button>
        ) : !isOwnPost && onBlockUser && !isBlocked ? (
          <button
            type="button"
            onClick={handleBlockUser}
            disabled={blockState === 'blocking'}
            aria-label="Nutzer blockieren"
            className="flex items-center gap-1.5 rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-xs font-semibold text-brezn-danger hover:opacity-90 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
            title="Nutzer blockieren"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="opacity-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
            <span>{blockState === 'blocking' ? '…' : 'Blockieren'}</span>
          </button>
        ) : null
      }
      onClose={onClose}
    >
      <div className="space-y-3">
        {deleteState === 'error' && deleteError ? (
          <div className="rounded-2xl border border-brezn-border bg-brezn-panel2 p-3 text-sm text-brezn-danger">
            {deleteError}
          </div>
        ) : null}
        <div>
          <PostCard evt={root} viewerPoint={viewerPoint} profile={profilesByPubkey.get(root.pubkey)} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold text-brezn-muted">Antworten ({replyCount})</div>
            {isOffline ? <div className="text-[11px] text-brezn-muted">Offline</div> : null}
          </div>
          {replies.length ? (
            <div className="space-y-2">
              {replies.map(r => (
                <PostCard key={r.id} evt={r} viewerPoint={viewerPoint} profile={profilesByPubkey.get(r.pubkey)} />
              ))}
            </div>
          ) : null}
        </div>

        <div className="-mx-4 mt-3 border-t border-brezn-border bg-brezn-panel px-4 pb-[env(safe-area-inset-bottom)] pt-3">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Antwort schreiben…"
            className="mt-2 h-24 w-full resize-none rounded-2xl border border-brezn-border bg-brezn-panel2 p-3 text-sm outline-none focus:ring-2 focus:ring-brezn-gold/40"
            disabled={isOffline}
          />
          {publishState === 'error' && publishError ? <div className="mt-2 text-sm text-brezn-danger">{publishError}</div> : null}
          <div className="mt-2">
            <button
              onClick={() => void publish()}
              disabled={publishState === 'publishing' || !text.trim() || isOffline}
              className="w-full rounded-2xl bg-brezn-gold px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
            >
              {publishState === 'publishing' ? 'Sende…' : 'Antworten'}
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  )
}

