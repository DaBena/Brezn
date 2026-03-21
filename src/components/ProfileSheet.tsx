import { useEffect, useMemo } from 'react'
import type { Event } from 'nostr-tools'
import * as nip19 from 'nostr-tools/nip19'
import type { BreznNostrClient } from '../lib/nostrClient'
import type { GeoPoint } from '../lib/geo'
import { calculateApproxDistance } from '../lib/geo'
import { buttonBase, reactionButtonClasses } from '../lib/buttonStyles'
import { useAuthorNotes } from '../hooks/useAuthorNotes'
import { useProfiles, type Profile } from '../hooks/useProfiles'
import { shortNpub } from '../lib/nostrUtils'
import { extractLinks } from '../lib/urls'
import { PostContent } from './PostContent'
import { Sheet } from './Sheet'

const FEED_MAX_FLOWTEXT_LENGTH = 280

function truncateContentForFeed(content: string): string {
  const links = extractLinks(content)
  let flowTextLength = 0
  let cursor = 0
  for (const link of links) {
    flowTextLength += content.slice(cursor, link.start).length
    cursor = link.end
  }
  flowTextLength += content.slice(cursor).length

  if (flowTextLength <= FEED_MAX_FLOWTEXT_LENGTH) return content

  cursor = 0
  let result = ''
  let flowUsed = 0
  for (const link of links) {
    const textBefore = content.slice(cursor, link.start)
    const len = textBefore.length
    if (flowUsed + len <= FEED_MAX_FLOWTEXT_LENGTH) {
      result += textBefore
      result += content.slice(link.start, link.end)
      flowUsed += len
      cursor = link.end
    } else {
      const remaining = FEED_MAX_FLOWTEXT_LENGTH - flowUsed
      result += textBefore.slice(0, remaining) + '\n...'
      return result
    }
  }
  const textAfter = content.slice(cursor)
  const remaining = FEED_MAX_FLOWTEXT_LENGTH - flowUsed
  result += textAfter.slice(0, remaining) + '\n...'
  return result
}

const HEART_RED = '#e05a4f'

function HeartIcon({ liked }: { liked: boolean }) {
  const heartPath =
    'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z'
  return (
    <span
      aria-hidden="true"
      className={liked ? '' : 'text-brezn-muted'}
      style={liked ? { color: HEART_RED } : undefined}
    >
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill={liked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={heartPath} />
      </svg>
    </span>
  )
}

export function ProfileSheet(props: {
  open: boolean
  onClose: () => void
  pubkey: string
  client: BreznNostrClient
  viewerPoint: GeoPoint | null
  mutedTerms: string[]
  blockedPubkeys: string[]
  deletedNoteIds: Set<string>
  isOffline: boolean
  reactionsByNoteId: Record<string, { total: number; viewerReacted: boolean }>
  canReact: boolean
  onReact: (evt: Event) => void
  onOpenThread: (evt: Event) => void
  onNoteIdsChange?: (noteIds: string[]) => void
  /** Open DM with this profile’s pubkey; omit when viewing self or blocked user. */
  onOpenDM?: () => void
  /** Profile already loaded for the feed (name, picture, about); merged with fresh subscription. */
  cachedProfile?: Profile
}) {
  const {
    open,
    onClose,
    pubkey,
    cachedProfile,
    client,
    viewerPoint,
    mutedTerms,
    blockedPubkeys,
    deletedNoteIds,
    isOffline,
    reactionsByNoteId,
    canReact,
    onReact,
    onOpenThread,
    onNoteIdsChange,
    onOpenDM,
  } = props

  const { profilesByPubkey } = useProfiles({ client, pubkeys: [pubkey], isOffline })
  const subProfile = profilesByPubkey.get(pubkey)
  const profile = useMemo((): Profile | undefined => {
    if (!cachedProfile) return subProfile
    if (!subProfile) return cachedProfile
    return {
      pubkey,
      name: subProfile.name ?? cachedProfile.name,
      picture: subProfile.picture ?? cachedProfile.picture,
      about: subProfile.about ?? cachedProfile.about,
    }
  }, [pubkey, cachedProfile, subProfile])

  const { events, hasMore, loadingMore, loadMore } = useAuthorNotes({
    client,
    authorPubkey: pubkey,
    mutedTerms,
    blockedPubkeys,
    deletedNoteIds,
    isOffline,
  })

  useEffect(() => {
    onNoteIdsChange?.(events.map(e => e.id))
  }, [events, onNoteIdsChange])

  const displayName = profile?.name?.trim() || null
  const picture = profile?.picture?.trim() || null
  const about = profile?.about?.trim() || null

  const approxDistanceById = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const evt of events) {
      map[evt.id] = calculateApproxDistance(evt, viewerPoint)
    }
    return map
  }, [events, viewerPoint])

  const title = displayName || shortNpub(nip19.npubEncode(pubkey), 8, 4)

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="space-y-4">
        <header className="rounded-lg border border-brezn-border bg-brezn-panel2 p-4 shadow-soft">
          <div className="flex flex-col items-stretch gap-3 text-center sm:flex-row sm:items-start sm:text-left">
            {picture ? (
              <a
                href={picture}
                target="_blank"
                rel="noopener noreferrer"
                className="block h-20 w-20 shrink-0 overflow-hidden rounded-full border border-brezn-border outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brezn-border"
                aria-label="Open profile picture"
                onClick={e => e.stopPropagation()}
              >
                <img src={picture} alt="" className="h-full w-full object-cover" />
              </a>
            ) : (
              <div
                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-brezn-border bg-brezn-panel"
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" className="text-brezn-muted">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                {displayName ? (
                  <div className="text-lg font-semibold text-brezn-text">{displayName}</div>
                ) : null}
                <div className="font-mono text-[11px] text-brezn-muted">{shortNpub(nip19.npubEncode(pubkey), 12, 6)}</div>
                {about ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-brezn-text">{about}</p>
                ) : null}
              </div>
              {onOpenDM ? (
                <button
                  type="button"
                  onClick={() => onOpenDM()}
                  disabled={isOffline}
                  aria-label="Open direct message"
                  className={`flex shrink-0 items-center justify-center gap-2 self-center rounded-xl px-4 py-2.5 text-sm font-semibold sm:self-start ${buttonBase}`}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="opacity-90">
                    <path
                      fill="currentColor"
                      d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
                    />
                  </svg>
                  <span>Message</span>
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {isOffline ? (
          <div className="text-[11px] text-brezn-muted">Offline — profile posts may be incomplete.</div>
        ) : null}

        <div className="space-y-2">
          {events.length === 0 && !isOffline ? (
            <div className="rounded-lg border border-brezn-border bg-brezn-panel px-3 py-4 text-center text-sm text-brezn-muted">
              No posts found from relays yet.
            </div>
          ) : null}

          {events.map(evt => {
            const isDeleted = deletedNoteIds.has(evt.id)
            const dist = approxDistanceById[evt.id]
            if (isDeleted) {
              return (
                <article
                  key={evt.id}
                  className="rounded-lg border border-brezn-border bg-brezn-muted/20 px-3 py-2 shadow-soft opacity-80"
                  aria-label="Deleted post"
                >
                  <div className="text-[11px] font-medium text-brezn-muted">Deleted – propagating to relays</div>
                  <div className="mt-1 text-[11px] text-brezn-muted">
                    {new Date(evt.created_at * 1000).toLocaleString(undefined, {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {dist ? <span> / {dist}</span> : null}
                  </div>
                  <div className="mt-2">
                    <PostContent content={truncateContentForFeed(evt.content)} interactive compact />
                  </div>
                </article>
              )
            }
            return (
              <article
                key={evt.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenThread(evt)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenThread(evt)
                  }
                }}
                className="cursor-pointer rounded-lg border border-brezn-border bg-brezn-panel px-3 py-2 shadow-soft hover:bg-brezn-panel/80 focus:outline-none"
                aria-label="Open post"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="shrink-0 text-[11px] text-brezn-muted">
                    {new Date(evt.created_at * 1000).toLocaleString(undefined, {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {dist ? <span> / {dist}</span> : null}
                  </span>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      onReact(evt)
                    }}
                    disabled={!canReact || Boolean(reactionsByNoteId[evt.id]?.viewerReacted)}
                    className={reactionButtonClasses(
                      Boolean(reactionsByNoteId[evt.id]?.viewerReacted),
                      canReact,
                    )}
                    aria-label={`Send reaction${
                      reactionsByNoteId[evt.id]?.total ? ` (${reactionsByNoteId[evt.id]?.total})` : ''
                    }`}
                  >
                    <HeartIcon liked={Boolean(reactionsByNoteId[evt.id]?.viewerReacted)} />
                    <span className="font-mono">{reactionsByNoteId[evt.id]?.total ?? 0}</span>
                  </button>
                </div>
                <div className="mt-2">
                  <PostContent content={truncateContentForFeed(evt.content)} interactive compact />
                </div>
              </article>
            )
          })}
        </div>

        {hasMore && events.length > 0 ? (
          <button
            type="button"
            onClick={() => loadMore()}
            disabled={loadingMore}
            className={`w-full rounded-lg px-3 py-2 text-sm font-semibold ${buttonBase}`}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        ) : null}
      </div>
    </Sheet>
  )
}
