import { useEffect, useMemo, useState } from 'react'
import type { Event } from 'nostr-tools'
import type { FeedState } from '../hooks/useLocalFeed'
import type { Profile } from '../hooks/useProfiles'
import type { BreznNostrClient } from '../lib/nostrClient'
import type { GeoPoint } from '../lib/geo'
import { calculateApproxDistance } from '../lib/geo'
import { buttonBase } from '../lib/buttonStyles'
import { FeedEventArticle, LoadOlderPostsButton } from './FeedEventArticle'
import { FEED_RENDER_CHUNK, REPO_URL } from '../lib/constants'
import { truncateFeedCardContent } from '../lib/feedContentPreview'

export function Feed(props: {
  client: BreznNostrClient
  feedState: FeedState
  geoCell: string | null
  viewerPoint: GeoPoint | null
  isOffline: boolean
  /** No stored cell yet: show first-run / consent UI above the feed. */
  showCookieNotice: boolean
  profilesByPubkey: Map<string, Profile>
  reactionsByNoteId: Record<string, { total: number; viewerReacted: boolean }>
  canReact: boolean
  events: Event[]
  searchQuery: string
  initialTimedOut: boolean
  lastCloseReasons: string[] | null
  isLoadingMore: boolean
  deletedNoteIds: Set<string>
  onRequestLocation: () => void
  onLoadMore: () => void
  onReact: (evt: Event) => void
  onOpenThread: (evt: Event) => void
}) {
  const {
    feedState,
    client,
    geoCell,
    viewerPoint,
    isOffline,
    showCookieNotice,
    profilesByPubkey,
    events,
    searchQuery,
    initialTimedOut,
    lastCloseReasons,
    isLoadingMore,
    deletedNoteIds,
    onRequestLocation,
    onLoadMore,
    onOpenThread,
  } = props

  // Client row cap (media lazy in PostContent); relay older = onLoadMore.
  const [displayLimit, setDisplayLimit] = useState(FEED_RENDER_CHUNK)

  const displayedEvents = useMemo(() => events.slice(0, displayLimit), [events, displayLimit])
  const hasMoreInBuffer = events.length > displayLimit

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [searchQuery])

  const approxDistanceById = useMemo(() => {
    if (!viewerPoint) return {} as Record<string, string>
    const out: Record<string, string> = {}
    for (const evt of displayedEvents) {
      const label = calculateApproxDistance(evt, viewerPoint)
      if (label) out[evt.id] = label
    }
    return out
  }, [displayedEvents, viewerPoint])

  const handleLoadMore = () => {
    if (hasMoreInBuffer) {
      setDisplayLimit(prev => prev + FEED_RENDER_CHUNK)
    } else {
      onLoadMore()
    }
  }

  return (
    <main className="mx-auto max-w-xl px-3 pb-24 pt-12">
      {isOffline ? (
        <div className="mb-2 rounded-lg border border-brezn-border bg-brezn-panel p-2 text-xs text-brezn-muted">
          Offline - showing last seen posts (read-only).
        </div>
      ) : null}
      
      {feedState.kind === 'need-location' && (
        <div className="rounded-lg border border-brezn-border bg-brezn-panel p-3">
          <div className="text-sm font-semibold">Location for local feed</div>
          <div className="mt-1 text-sm text-brezn-muted">
            This app needs your approximate area to show local posts. You can manually change it later. Your position is reduced to a geohash cell (~5 km) to protect your privacy.
          </div>
          {showCookieNotice ? (
            <div className="mt-2 text-sm text-brezn-muted space-y-1">
              <p>
                This app uses local storage on your device. No tracking and no personal data is sent to us. See the{' '}
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brezn-link underline"
                >
                  source, README & license
                </a>
                .
              </p>
              <p>
                This app loads user content from external sources (nostr relays, file servers). We accept no liability for any external
                content.
              </p>
              <p>By continuing you confirm: I informed myself and accept.</p>
            </div>
          ) : null}
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => onRequestLocation()}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${buttonBase}`}
            >
              Allow location
            </button>
          </div>
        </div>
      )}

      {feedState.kind === 'error' && (
        <div className="rounded-lg border border-brezn-border bg-brezn-panel p-3">
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
          {displayedEvents.length === 0 ? (
            <div className="rounded-lg border border-brezn-border bg-brezn-panel p-3 text-sm text-brezn-muted">
              {feedState.kind === 'loading' ? (
                initialTimedOut ? (
                  <>
                    {lastCloseReasons?.length ? 'Relay connection failed. ' : null}
                    No response from relays. Check the relay list or try again later.
                    {lastCloseReasons?.length ? (
                      <div className="mt-2 rounded-xl border border-brezn-border bg-brezn-panel p-2 font-mono text-xs">
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
                {displayedEvents.map(evt => (
                  <FeedEventArticle
                    key={evt.id}
                    variant="feed"
                    evt={evt}
                    isDeleted={deletedNoteIds.has(evt.id)}
                    contentPreview={truncateFeedCardContent(evt.content)}
                    profilesByPubkey={profilesByPubkey}
                    distanceLabel={approxDistanceById[evt.id]}
                    client={client}
                    onOpenThread={onOpenThread}
                  />
                ))}
              </div>
              <LoadOlderPostsButton
                wrapWithMargin
                onClick={handleLoadMore}
                loading={isLoadingMore && !hasMoreInBuffer}
              />
            </>
          )}
        </>
      )}
    </main>
  )
}
