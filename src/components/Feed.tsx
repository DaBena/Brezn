import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Event } from '../lib/nostrPrimitives'
import type { FeedState } from '../hooks/useLocalFeed'
import type { Profile } from '../hooks/useProfiles'
import type { BreznNostrClient } from '../lib/nostrClient'
import type { GeoPoint } from '../lib/geo'
import { calculateApproxDistance } from '../lib/geo'
import { isNip52CalendarKind, nip52DistanceLabel } from '../lib/nip52'
import { buttonBase } from '../lib/buttonStyles'
import { FeedEventArticle, LoadOlderPostsButton } from './FeedEventArticle'
import { FEED_RENDER_CHUNK, REPO_URL, SEARCH_PEOPLE_DISPLAY_MAX } from '../lib/constants'
import {
  feedEventCardPlainText,
  truncateFeedCardContent,
  truncateFeedCardContentAroundQuery,
} from '../lib/feedContentPreview'
import { GeohashMap } from './GeohashMap'
import { FollowButton } from './FollowButton'
import { nip19 } from '../lib/nostrPrimitives'
import { shortNpub } from '../lib/nostrUtils'
import { feedListPostCardClass } from '../lib/uiClasses'
import type { SearchPerson } from '../hooks/useSearch'

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
  onRequestLocation: (onFinished?: () => void) => void
  /** Pick ~5 km geohash cell from OSM map when GPS is unavailable (e.g. Safari). */
  onManualCellSelect: (geohash5: string) => void
  onLoadMore: () => void
  onReact: (evt: Event) => void
  onOpenThread: (evt: Event) => void
  onOpenProfile?: (pubkey: string) => void
  searchPeople?: SearchPerson[]
  isSearching?: boolean
  hasQuery?: boolean
  viewerPubkey?: string | null
  followedPubkeys?: string[]
  onFollow?: (pubkey: string) => void
  onUnfollow?: (pubkey: string) => void
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
    onRequestLocation,
    onManualCellSelect,
    onLoadMore,
    onOpenThread,
    onOpenProfile,
    searchPeople = [],
    isSearching = false,
    hasQuery = false,
    viewerPubkey = null,
    followedPubkeys = [],
    onFollow,
    onUnfollow,
  } = props
  const followedSet = useMemo(
    () => new Set(followedPubkeys.map((p) => p.toLowerCase())),
    [followedPubkeys],
  )

  const { t } = useTranslation()

  // Client row cap (media lazy in PostContent); relay older = onLoadMore.
  const [displayLimit, setDisplayLimit] = useState(FEED_RENDER_CHUNK)

  const displayedEvents = useMemo(() => events.slice(0, displayLimit), [events, displayLimit])
  const hasMoreInBuffer = events.length > displayLimit

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [searchQuery])

  const approxDistanceById = useMemo(() => {
    if (!viewerPoint) return {} as Record<string, ReturnType<typeof calculateApproxDistance>>
    const out: Record<string, NonNullable<ReturnType<typeof calculateApproxDistance>>> = {}
    for (const evt of displayedEvents) {
      const info = isNip52CalendarKind(evt.kind)
        ? nip52DistanceLabel(evt, viewerPoint)
        : calculateApproxDistance(evt, viewerPoint)
      if (info) out[evt.id] = info
    }
    return out
  }, [displayedEvents, viewerPoint])

  const handleLoadMore = () => {
    if (hasMoreInBuffer) {
      setDisplayLimit((prev) => prev + FEED_RENDER_CHUNK)
    } else {
      onLoadMore()
    }
  }

  const followedLower = viewerPubkey?.toLowerCase() ?? ''

  return (
    <main className="mx-auto max-w-xl px-3 pb-24 pt-12">
      {isOffline ? (
        <div className="mb-2 rounded-lg border border-brezn-border bg-brezn-panel p-2 text-xs text-brezn-muted">
          {t('feed.offlineBanner')}
        </div>
      ) : null}

      {hasQuery ? (
        <div className="mb-3 space-y-2">
          {searchPeople.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-brezn-muted">{t('search.people')}</div>
              {searchPeople.slice(0, SEARCH_PEOPLE_DISPLAY_MAX).map((person) => {
                const pk = person.pubkey.toLowerCase()
                const isSelf = Boolean(followedLower) && pk === followedLower
                const isFollowed = followedSet.has(pk)
                const cached = profilesByPubkey.get(pk)
                const label =
                  person.displayName?.trim() ||
                  person.name?.trim() ||
                  cached?.name?.trim() ||
                  shortNpub(nip19.npubEncode(pk), 8, 4)
                return (
                  <div key={pk} className={`${feedListPostCardClass} flex items-center gap-2`}>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => onOpenProfile?.(pk)}
                    >
                      <div className="text-sm font-semibold text-brezn-text">{label}</div>
                      <div className="truncate font-mono text-[11px] text-brezn-muted">
                        {nip19.npubEncode(pk)}
                      </div>
                    </button>
                    {onFollow && onUnfollow && !isSelf ? (
                      <FollowButton
                        isFollowed={isFollowed}
                        disabled={isOffline}
                        onClick={() => (isFollowed ? onUnfollow(pk) : onFollow(pk))}
                      />
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}
          {isSearching && displayedEvents.length === 0 && searchPeople.length === 0 ? (
            <div className="rounded-lg border border-brezn-border bg-brezn-panel p-3 text-sm text-brezn-muted">
              {t('search.searching')}
            </div>
          ) : null}
          {!isSearching && displayedEvents.length === 0 && searchPeople.length === 0 ? (
            <div className="rounded-lg border border-brezn-border bg-brezn-panel p-3 text-sm text-brezn-muted">
              {t('search.noResults')}
            </div>
          ) : null}
          {displayedEvents.length > 0 ? (
            <div className="text-xs font-semibold text-brezn-muted">{t('search.posts')}</div>
          ) : null}
        </div>
      ) : null}

      {feedState.kind === 'need-location' && (
        <div className="rounded-lg border border-brezn-border bg-brezn-panel p-3">
          <div className="text-sm font-semibold">{t('feed.locationTitle')}</div>
          <div className="mt-1 text-sm text-brezn-muted">{t('feed.locationBody')}</div>
          {showCookieNotice ? (
            <div className="mt-2 text-sm text-brezn-muted space-y-1">
              <p>
                {t('feed.privacyStorage')}{' '}
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brezn-link underline"
                >
                  {t('feed.privacyLink')}
                </a>
                .
              </p>
              <p>{t('feed.privacyDisclaimer')}</p>
              <p>{t('feed.privacyConfirm')}</p>
            </div>
          ) : null}
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => onRequestLocation()}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${buttonBase}`}
            >
              {t('feed.allowLocation')}
            </button>
          </div>
          {'locationError' in feedState && feedState.locationError ? (
            <p className="mt-2 text-sm text-red-700 dark:text-red-400">{feedState.locationError}</p>
          ) : null}
          <div className="mt-3 h-[min(55vh,320px)] min-h-[240px] w-full overflow-hidden rounded-lg border border-brezn-border">
            <GeohashMap
              worldPick
              className="h-full w-full"
              onCellSelect={onManualCellSelect}
              onRequestLocation={onRequestLocation}
              gpsAriaLabel={t('geohashMap.gpsAria')}
              gpsTitle={t('geohashMap.gpsTitle')}
            />
          </div>
        </div>
      )}

      {feedState.kind === 'error' && (
        <div className="rounded-lg border border-brezn-border bg-brezn-panel p-3">
          <div className="text-sm font-semibold">{t('feed.errorTitle')}</div>
          <div className="mt-1 text-sm text-brezn-muted">{feedState.message}</div>
          {feedState.code !== 'no-relays' ? (
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => onRequestLocation()}
                className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${buttonBase}`}
              >
                {t('feed.tryAgain')}
              </button>
            </div>
          ) : null}
        </div>
      )}

      {(((feedState.kind === 'loading' || feedState.kind === 'live') && Boolean(geoCell)) ||
        (hasQuery && displayedEvents.length > 0)) && (
        <>
          {displayedEvents.length === 0 ? (
            <div className="rounded-lg border border-brezn-border bg-brezn-panel p-3 text-sm text-brezn-muted">
              {feedState.kind === 'loading' ? (
                initialTimedOut ? (
                  <>
                    {lastCloseReasons?.length ? t('feed.relayFailPrefix') : null}
                    {t('feed.noRelayResponse')}
                    {lastCloseReasons?.length ? (
                      <div className="mt-2 rounded-xl border border-brezn-border bg-brezn-panel p-2 font-mono text-xs">
                        {lastCloseReasons.join(' • ')}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>{t('feed.waitingEose')}</>
                )
              ) : (
                <>{t('feed.noPostsYet')}</>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {displayedEvents.map((evt) => (
                  <FeedEventArticle
                    key={evt.id}
                    variant="feed"
                    evt={evt}
                    isDeleted={false}
                    contentPreview={
                      hasQuery
                        ? truncateFeedCardContentAroundQuery(
                            feedEventCardPlainText(evt),
                            searchQuery,
                            evt.tags,
                          )
                        : truncateFeedCardContent(feedEventCardPlainText(evt), evt.tags)
                    }
                    profilesByPubkey={profilesByPubkey}
                    distance={approxDistanceById[evt.id]}
                    client={client}
                    onOpenThread={onOpenThread}
                    onOpenProfile={onOpenProfile}
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
