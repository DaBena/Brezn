import { useMemo } from 'react'
import type { Event } from 'nostr-tools'
import type { FeedState } from '../hooks/useLocalFeed'
import type { GeoPoint } from '../lib/geo'
import { decodeGeohashCenter, formatApproxDistance, haversineDistanceKm } from '../lib/geo'
import { getLongestGeohashTag } from '../lib/nostrUtils'
import { PostContent } from './PostContent'
import { PostIdentity } from './PostIdentity'
import { useProfiles } from '../hooks/useProfiles'
import type { BreznNostrClient } from '../lib/nostrClient'

export function Feed(props: {
  feedState: FeedState
  geoCell: string | null
  viewerPoint: GeoPoint | null
  isOffline: boolean
  reactionsByNoteId: Record<string, { total: number; viewerReacted: boolean }>
  canReact: boolean
  events: Event[]
  initialTimedOut: boolean
  lastCloseReasons: string[] | null
  isLoadingMore: boolean
  client: BreznNostrClient
  onRequestLocation: () => void
  onLoadMore: () => void
  onReact: (evt: Event) => void
  onOpenThread: (evt: Event) => void
}) {
  const {
    feedState,
    geoCell,
    viewerPoint,
    isOffline,
    reactionsByNoteId,
    canReact,
    events,
    initialTimedOut,
    lastCloseReasons,
    isLoadingMore,
    client,
    onRequestLocation,
    onLoadMore,
    onReact,
    onOpenThread,
  } = props

  const pubkeys = useMemo(() => events.map(e => e.pubkey), [events])
  const { profilesByPubkey } = useProfiles({ client, pubkeys, isOffline })

  const approxDistanceById = useMemo(() => {
    if (!viewerPoint) return {} as Record<string, string>
    const out: Record<string, string> = {}
    for (const evt of events) {
      // Use the longest (most precise) geohash tag for accurate distance calculation
      const g = getLongestGeohashTag(evt)
      if (!g) continue
      const p = decodeGeohashCenter(g)
      if (!p) continue
      const km = haversineDistanceKm(viewerPoint, p)
      const label = formatApproxDistance(km, g.length)
      if (label) out[evt.id] = label
    }
    return out
  }, [events, viewerPoint])

  return (
    <main className="mx-auto max-w-xl px-4 pb-28 pt-4">
      {isOffline ? (
        <div className="mb-3 rounded-2xl border border-brezn-border bg-brezn-panel2 p-3 text-xs text-brezn-muted shadow-soft">
          Offline - showing last seen posts (read-only).
        </div>
      ) : null}
      {feedState.kind === 'need-location' && (
        <div className="rounded-2xl border border-brezn-border bg-brezn-panel p-4 shadow-soft">
          <div className="text-sm font-semibold">Location for local feed</div>
          <div className="mt-1 text-sm text-brezn-muted">
            Brezn uses a rough geohash to load posts near you.
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={onRequestLocation}
              className="rounded-xl bg-brezn-gold px-4 py-2 text-sm font-semibold text-brezn-bg hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
            >
              Allow location
            </button>
          </div>
        </div>
      )}

      {feedState.kind === 'error' && (
        <div className="rounded-2xl border border-brezn-border bg-brezn-panel p-4 shadow-soft">
          <div className="text-sm font-semibold">Error</div>
          <div className="mt-1 text-sm text-brezn-muted">{feedState.message}</div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={onRequestLocation}
              className="rounded-xl bg-brezn-gold px-4 py-2 text-sm font-semibold text-brezn-bg hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {(feedState.kind === 'loading' || feedState.kind === 'live') && Boolean(geoCell) && (
        <>
          {events.length === 0 ? (
            <div className="rounded-2xl border border-brezn-border bg-brezn-panel p-4 text-sm text-brezn-muted shadow-soft">
              {feedState.kind === 'loading' ? (
                initialTimedOut ? (
                  <>
                    No response from relays. Check the relay list or try again later.
                    {lastCloseReasons?.length ? (
                      <div className="mt-2 rounded-xl border border-brezn-border bg-brezn-panel2 p-2 font-mono text-xs">
                        {lastCloseReasons.join(' • ')}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>No events received yet (waiting for EOSE)…</>
                )
              ) : (
                <>No posts found yet. Try again later or try different relays.</>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {events.map(evt => (
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
                    className="cursor-pointer rounded-2xl border border-brezn-border bg-brezn-panel p-4 shadow-soft hover:bg-brezn-panel/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
                    aria-label="Open post"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <PostIdentity pubkey={evt.pubkey} profile={profilesByPubkey.get(evt.pubkey)} />
                      </div>
                      <div className="shrink-0 text-[11px] text-brezn-muted">
                        {new Date(evt.created_at * 1000).toLocaleString()}
                        {approxDistanceById[evt.id] ? <span> / {approxDistanceById[evt.id]}</span> : null}
                      </div>
                    </div>
                    <div className="mt-2">
                      <PostContent content={evt.content} interactive />
                    </div>
                    <div className="mt-3 flex items-center justify-end">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            onReact(evt)
                          }}
                          disabled={!canReact || Boolean(reactionsByNoteId[evt.id]?.viewerReacted)}
                          className={[
                            'flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold',
                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40',
                            reactionsByNoteId[evt.id]?.viewerReacted
                              ? 'border-black/20 bg-brezn-gold text-brezn-bg'
                              : 'border-brezn-border bg-brezn-panel2 text-brezn-text hover:opacity-90',
                            !canReact || reactionsByNoteId[evt.id]?.viewerReacted ? 'opacity-60' : '',
                          ].join(' ')}
                          aria-label={`Send reaction${reactionsByNoteId[evt.id]?.total ? ` (${reactionsByNoteId[evt.id]?.total})` : ''}`}
                        >
                          <span aria-hidden="true">👍</span>
                          <span className="font-mono">{reactionsByNoteId[evt.id]?.total ?? 0}</span>
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="mt-4">
                <button
                  onClick={onLoadMore}
                  disabled={isLoadingMore}
                  className="w-full rounded-2xl border border-brezn-border bg-brezn-panel px-4 py-3 text-sm font-semibold disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
                >
                  {isLoadingMore ? 'Loading more…' : 'Load more'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </main>
  )
}

