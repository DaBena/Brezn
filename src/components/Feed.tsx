import { useMemo } from 'react'
import type { Event } from 'nostr-tools'
import type { FeedState } from '../hooks/useLocalFeed'
import type { GeoPoint } from '../lib/geo'
import { calculateApproxDistance } from '../lib/geo'
import { buttonBase } from '../lib/buttonStyles'
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
  onOpenChat?: (pubkey: string) => void
}) {
  const {
    feedState,
    geoCell,
    viewerPoint,
    isOffline,
    events,
    initialTimedOut,
    lastCloseReasons,
    isLoadingMore,
    client,
    onRequestLocation,
    onLoadMore,
    onOpenThread,
    onOpenChat,
  } = props

  const pubkeys = useMemo(() => events.map(e => e.pubkey), [events])
  const { profilesByPubkey } = useProfiles({ client, pubkeys, isOffline })

  const approxDistanceById = useMemo(() => {
    if (!viewerPoint) return {} as Record<string, string>
    const out: Record<string, string> = {}
    for (const evt of events) {
      const label = calculateApproxDistance(evt, viewerPoint)
      if (label) out[evt.id] = label
    }
    return out
  }, [events, viewerPoint])

  return (
    <main className="mx-auto max-w-xl px-3 pb-14 pt-12">
      {isOffline ? (
        <div className="mb-2 rounded-lg border border-brezn-border bg-brezn-panel2 p-2 text-xs text-brezn-muted shadow-soft">
          Offline - showing last seen posts (read-only).
        </div>
      ) : null}
      
      {feedState.kind === 'need-location' && (
        <div className="rounded-lg border border-brezn-border bg-brezn-panel p-3 shadow-soft">
          <div className="text-sm font-semibold">Location for local feed</div>
          <div className="mt-1 text-sm text-brezn-muted">
            Brezn uses a rough geohash to load posts near you.
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={onRequestLocation}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${buttonBase}`}
            >
              Allow location
            </button>
          </div>
        </div>
      )}

      {feedState.kind === 'error' && (
        <div className="rounded-lg border border-brezn-border bg-brezn-panel p-3 shadow-soft">
          <div className="text-sm font-semibold">Error</div>
          <div className="mt-1 text-sm text-brezn-muted">{feedState.message}</div>
          {!feedState.message.includes('No relays configured') ? (
            <div className="mt-2 flex gap-2">
              <button
                onClick={onRequestLocation}
                className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${buttonBase}`}
              >
                Try again
              </button>
            </div>
          ) : null}
        </div>
      )}

      {(feedState.kind === 'loading' || feedState.kind === 'live') && Boolean(geoCell) && (
        <>
          {events.length === 0 ? (
            <div className="rounded-lg border border-brezn-border bg-brezn-panel p-3 text-sm text-brezn-muted shadow-soft">
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
              <div className="space-y-2">
                {events.length === 0 ? (
                  <div className="rounded-lg border border-brezn-border bg-brezn-panel p-3 text-sm text-brezn-muted shadow-soft">
                    No posts found
                  </div>
                ) : (
                  events.map(evt => (
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
                      <div className="min-w-0 flex-1">
                        <PostIdentity 
                          pubkey={evt.pubkey} 
                          profile={profilesByPubkey.get(evt.pubkey)}
                          onClick={onOpenChat ? () => onOpenChat(evt.pubkey) : undefined}
                        />
                      </div>
                      <div className="shrink-0 text-[11px] text-brezn-muted">
                        {new Date(evt.created_at * 1000).toLocaleString()}
                        {approxDistanceById[evt.id] ? <span> / {approxDistanceById[evt.id]}</span> : null}
                      </div>
                    </div>
                    <div className="mt-2">
                      <PostContent 
                        content={evt.content} 
                        interactive 
                        compact 
                      />
                    </div>
                  </article>
                  ))
                )}
              </div>
              <div className="mt-3">
                <button
                  onClick={onLoadMore}
                  disabled={isLoadingMore}
                  className={`w-full rounded-lg px-3 py-2 text-sm font-semibold ${buttonBase}`}
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
