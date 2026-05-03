import { useTranslation } from 'react-i18next'
import type { Event } from '../lib/nostrPrimitives'
import { formatEventCardTimestamp, shortNpub } from '../lib/nostrUtils'
import { extractLinks } from '../lib/urls'

function stop(e: React.SyntheticEvent) {
  e.stopPropagation()
}

function previewText(content: string): string {
  const links = extractLinks(content)
  let flowText = ''
  let cursor = 0
  for (const link of links) {
    flowText += content.slice(cursor, link.start)
    cursor = link.end
  }
  flowText += content.slice(cursor)
  return flowText.replace(/\s+/g, ' ').trim().slice(0, 140)
}

export function QuotedPostCard(props: {
  event: Event | null | undefined
  loading?: boolean
  href: string
  display: string
  compact?: boolean
  interactive?: boolean
  onOpenThread?: (evt: Event) => void
}) {
  const { t } = useTranslation()
  const {
    event,
    loading = false,
    href,
    display,
    compact = false,
    interactive,
    onOpenThread,
  } = props

  if (!event) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={interactive ? stop : undefined}
        className="my-1 block rounded-lg border border-brezn-border bg-brezn-panel px-3 py-2 text-xs text-brezn-muted hover:opacity-90"
      >
        {loading ? t('quotedPost.loadingReferenced') : display}
      </a>
    )
  }

  const content = previewText(event.content)
  const ts = formatEventCardTimestamp(event.created_at)
  const label = shortNpub(event.pubkey, 8, 4)

  const body = (
    <div className="my-1 rounded-lg border border-brezn-border bg-brezn-panel px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-[11px] text-brezn-muted">
        <span className="font-mono">{label}</span>
        <span>{ts}</span>
      </div>
      <div className={`mt-1 break-words ${compact ? 'text-xs' : 'text-sm'}`}>
        {content || t('quotedPost.noText')}
      </div>
    </div>
  )

  if (onOpenThread) {
    return (
      <button
        type="button"
        onClick={(e) => {
          if (interactive) stop(e)
          onOpenThread(event)
        }}
        className="block w-full text-left focus:outline-none"
      >
        {body}
      </button>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={interactive ? stop : undefined}
      className="block hover:opacity-90"
    >
      {body}
    </a>
  )
}
