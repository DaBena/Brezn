import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Event } from 'nostr-tools'
import * as nip19 from 'nostr-tools/nip19'
import type { BreznNostrClient } from '../lib/nostrClient'
import type { GeoPoint } from '../lib/geo'
import { calculateApproxDistance } from '../lib/geo'
import { isNip52CalendarKind, nip52DistanceLabel } from '../lib/nip52'
import { buttonBase } from '../lib/buttonStyles'
import { useAuthorNotes } from '../hooks/useAuthorNotes'
import { useProfiles, type Profile } from '../hooks/useProfiles'
import { shortNpub } from '../lib/nostrUtils'
import { feedEventCardPlainText, truncateProfileCardContent } from '../lib/feedContentPreview'
import { Sheet } from './Sheet'
import { FEED_RENDER_CHUNK } from '../lib/constants'
import { FeedEventArticle, LoadOlderPostsButton } from './FeedEventArticle'

export function ProfileSheet(props: {
  open: boolean
  onClose: () => void
  pubkey: string
  client: BreznNostrClient
  viewerPoint: GeoPoint | null
  mutedTerms: string[]
  blockedPubkeys: string[]
  isOffline: boolean
  reactionsByNoteId: Record<string, { total: number; viewerReacted: boolean }>
  canReact: boolean
  onReact: (evt: Event) => void
  onOpenThread: (evt: Event) => void
  onOpenProfile?: (pubkey: string) => void
  onNoteIdsChange?: (noteIds: string[]) => void
  /** Optional; hide for self or blocked peer. */
  onOpenDM?: () => void
  /** Warm start from feed list; merged with sheet subscription. */
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
    isOffline,
    reactionsByNoteId,
    canReact,
    onReact,
    onOpenThread,
    onOpenProfile,
    onNoteIdsChange,
    onOpenDM,
  } = props

  const { t } = useTranslation()
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
    isOffline,
  })

  const [displayLimit, setDisplayLimit] = useState(FEED_RENDER_CHUNK)
  const displayedEvents = useMemo(() => events.slice(0, displayLimit), [events, displayLimit])
  const hasMoreDisplayed = events.length > displayLimit

  useEffect(() => {
    if (!open) return
    const schedule = (fn: () => void) => {
      if (typeof queueMicrotask === 'function') queueMicrotask(fn)
      else window.setTimeout(fn, 0)
    }
    schedule(() => setDisplayLimit(FEED_RENDER_CHUNK))
  }, [open, pubkey])

  useEffect(() => {
    onNoteIdsChange?.(events.map((e) => e.id))
  }, [events, onNoteIdsChange])

  const displayName = profile?.name?.trim() || null
  const picture = profile?.picture?.trim() || null
  const about = profile?.about?.trim() || null

  const approxDistanceById = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const evt of displayedEvents) {
      map[evt.id] = isNip52CalendarKind(evt.kind)
        ? nip52DistanceLabel(evt, viewerPoint)
        : calculateApproxDistance(evt, viewerPoint)
    }
    return map
  }, [displayedEvents, viewerPoint])

  const handleShowMore = () => {
    if (hasMoreDisplayed) {
      setDisplayLimit((prev) => prev + FEED_RENDER_CHUNK)
    } else {
      loadMore()
    }
  }

  const title = displayName || shortNpub(nip19.npubEncode(pubkey), 8, 4)

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="space-y-4">
        <header className="rounded-lg border border-brezn-border bg-brezn-panel p-4">
          <div className="flex flex-col items-stretch gap-3 text-center sm:flex-row sm:items-start sm:text-left">
            {picture ? (
              <a
                href={picture}
                target="_blank"
                rel="noopener noreferrer"
                className="block h-20 w-20 shrink-0 overflow-hidden rounded-full border border-brezn-border outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brezn-border"
                aria-label={t('profileSheet.openPictureAria')}
                onClick={(e) => e.stopPropagation()}
              >
                <img src={picture} alt="" className="h-full w-full object-cover" />
              </a>
            ) : (
              <div
                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-brezn-border bg-brezn-panel"
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="40"
                  height="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-brezn-text"
                >
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
                <div className="font-mono text-[11px] text-brezn-text">
                  {shortNpub(nip19.npubEncode(pubkey), 12, 6)}
                </div>
                {about ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-brezn-text">
                    {about}
                  </p>
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
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    aria-hidden="true"
                    className="opacity-90"
                  >
                    <path
                      fill="currentColor"
                      d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
                    />
                  </svg>
                  <span>{t('profileSheet.message')}</span>
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {isOffline ? (
          <div className="text-[11px] text-brezn-muted">{t('profileSheet.offlineHint')}</div>
        ) : null}

        <div className="space-y-2">
          {events.length === 0 && !isOffline ? (
            <div className="rounded-lg border border-brezn-border bg-brezn-panel px-3 py-4 text-center text-sm text-brezn-muted">
              {t('profileSheet.noPostsFromRelays')}
            </div>
          ) : null}

          {events.map((evt) => (
            <FeedEventArticle
              key={evt.id}
              variant="profile"
              evt={evt}
              isDeleted={false}
              contentPreview={truncateProfileCardContent(feedEventCardPlainText(evt))}
              distanceLabel={approxDistanceById[evt.id]}
              client={client}
              reactionsByNoteId={reactionsByNoteId}
              canReact={canReact}
              onReact={onReact}
              onOpenThread={onOpenThread}
              onOpenProfile={onOpenProfile}
            />
          ))}
        </div>

        {(hasMoreDisplayed || hasMore) && events.length > 0 ? (
          <LoadOlderPostsButton
            onClick={handleShowMore}
            loading={loadingMore && !hasMoreDisplayed}
          />
        ) : null}
      </div>
    </Sheet>
  )
}
