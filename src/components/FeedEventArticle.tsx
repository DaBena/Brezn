import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Event } from 'nostr-tools'
import type { Profile } from '../hooks/useProfiles'
import type { BreznNostrClient } from '../lib/nostrClient'
import { buttonBase, reactionButtonClasses } from '../lib/buttonStyles'
import { feedListPostCardClass, feedListPostDeletedClass } from '../lib/uiClasses'
import { formatEventCardTimestamp } from '../lib/nostrUtils'
import { PostContent } from './PostContent'
import { PostIdentity } from './PostIdentity'
import { HeartIcon } from './HeartIcon'

export type FeedEventArticleProps =
  | {
      variant: 'feed'
      evt: Event
      isDeleted: boolean
      contentPreview: string
      profilesByPubkey: Map<string, Profile>
      distanceLabel?: string | null
      client: BreznNostrClient
      onOpenThread: (evt: Event) => void
      onOpenProfile?: (pubkey: string) => void
    }
  | {
      variant: 'profile'
      evt: Event
      isDeleted: boolean
      contentPreview: string
      distanceLabel?: string | null
      client: BreznNostrClient
      reactionsByNoteId: Record<string, { total: number; viewerReacted: boolean }>
      canReact: boolean
      onReact: (evt: Event) => void
      onOpenThread: (evt: Event) => void
      onOpenProfile?: (pubkey: string) => void
    }

function displayNameFromTags(evt: Event): string | undefined {
  return evt.tags.find((t) => t[0] === 'n')?.[1]
}

function distanceSuffix(distanceLabel?: string | null) {
  return distanceLabel ? <span> / {distanceLabel}</span> : null
}

export function FeedEventArticle(props: FeedEventArticleProps) {
  const { t } = useTranslation()
  const { evt, isDeleted, contentPreview, distanceLabel, onOpenThread, client } = props
  const ts = formatEventCardTimestamp(evt.created_at)
  const dist = distanceSuffix(distanceLabel)

  if (isDeleted) {
    return (
      <article className={feedListPostDeletedClass} aria-label={t('feedArticle.deletedAria')}>
        <div className="text-[11px] font-medium text-brezn-muted">{t('feedArticle.deleted')}</div>
        {props.variant === 'feed' ? (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <PostIdentity
                pubkey={evt.pubkey}
                profile={props.profilesByPubkey.get(evt.pubkey)}
                displayNameOverride={displayNameFromTags(evt)}
              />
            </div>
            <div className="shrink-0 text-[11px] text-brezn-text">
              {ts}
              {dist}
            </div>
          </div>
        ) : (
          <div className="mt-1 text-[11px] text-brezn-text">
            {ts}
            {dist}
          </div>
        )}
        <div className="mt-2">
          <PostContent
            content={contentPreview}
            tags={evt.tags}
            interactive
            compact
            client={client}
            onOpenThread={onOpenThread}
            onOpenProfile={props.onOpenProfile}
          />
        </div>
      </article>
    )
  }

  const openKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpenThread(evt)
    }
  }

  if (props.variant === 'feed') {
    return (
      <article
        role="button"
        tabIndex={0}
        onClick={() => onOpenThread(evt)}
        onKeyDown={openKeyDown}
        className={feedListPostCardClass}
        aria-label={t('feedArticle.openPost')}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <PostIdentity
              pubkey={evt.pubkey}
              profile={props.profilesByPubkey.get(evt.pubkey)}
              displayNameOverride={displayNameFromTags(evt)}
            />
          </div>
          <div className="shrink-0 text-[11px] text-brezn-text">
            {ts}
            {dist}
          </div>
        </div>
        <div className="mt-2">
          <PostContent
            content={contentPreview}
            tags={evt.tags}
            interactive
            compact
            client={client}
            onOpenThread={onOpenThread}
            onOpenProfile={props.onOpenProfile}
          />
        </div>
      </article>
    )
  }

  const { reactionsByNoteId, canReact, onReact } = props
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpenThread(evt)}
      onKeyDown={openKeyDown}
      className={feedListPostCardClass}
      aria-label={t('feedArticle.openPost')}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="shrink-0 text-[11px] text-brezn-text">
          {ts}
          {dist}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onReact(evt)
          }}
          disabled={!canReact || Boolean(reactionsByNoteId[evt.id]?.viewerReacted)}
          className={reactionButtonClasses(
            Boolean(reactionsByNoteId[evt.id]?.viewerReacted),
            canReact,
          )}
          aria-label={
            reactionsByNoteId[evt.id]?.total
              ? t('feedArticle.sendReactionCount', { count: reactionsByNoteId[evt.id]?.total ?? 0 })
              : t('feedArticle.sendReaction')
          }
        >
          <HeartIcon liked={Boolean(reactionsByNoteId[evt.id]?.viewerReacted)} />
          <span className="font-mono">{reactionsByNoteId[evt.id]?.total ?? 0}</span>
        </button>
      </div>
      <div className="mt-2">
        <PostContent
          content={contentPreview}
          tags={evt.tags}
          interactive
          compact
          client={client}
          onOpenThread={onOpenThread}
          onOpenProfile={props.onOpenProfile}
        />
      </div>
    </article>
  )
}

export function LoadOlderPostsButton(props: {
  onClick: () => void
  /** True while fetching the next page from relays (button disabled). */
  loading?: boolean
  /** Wrap in `div.mt-3` (main feed layout). */
  wrapWithMargin?: boolean
}) {
  const { t } = useTranslation()
  const { onClick, loading, wrapWithMargin } = props
  const btn = (
    <button
      type="button"
      onClick={onClick}
      disabled={Boolean(loading)}
      className={`w-full rounded-lg px-3 py-2 text-sm font-semibold ${buttonBase}`}
    >
      {loading ? t('feedArticle.loading') : t('feedArticle.loadOlder')}
    </button>
  )
  if (wrapWithMargin) return <div className="mt-3">{btn}</div>
  return btn
}
