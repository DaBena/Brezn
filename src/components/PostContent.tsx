import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { Event } from '../lib/nostrPrimitives'
import { cn } from '../lib/cn'
import {
  extractLinks,
  extractPostReferences,
  extractProfileReferences,
  isLikelyImageUrl,
  isLikelyVideoUrl,
  uniqueUrls,
  isSafeUrl,
} from '../lib/urls'
import type { BreznNostrClient } from '../lib/nostrClient'
import { useReferencedPosts } from '../hooks/useReferencedPosts'
import { QuotedPostCard } from './QuotedPostCard'

function stop(e: React.SyntheticEvent) {
  e.stopPropagation()
}

function mediaGridClassName(mediaStacked: boolean, compact: boolean, count: number) {
  return cn(
    'mt-2 grid w-full gap-2',
    mediaStacked
      ? 'grid-cols-1'
      : compact
        ? count === 1
          ? 'grid-cols-1'
          : count <= 4
            ? 'grid-cols-2'
            : 'grid-cols-4'
        : count === 1
          ? 'grid-cols-1'
          : 'grid-cols-2',
  )
}

/** IntersectionObserver: defer heavy media until near viewport (bandwidth). */
function DeferUntilInView(props: {
  className?: string
  children: (mediaReady: boolean) => React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [mediaReady, setMediaReady] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || mediaReady) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setMediaReady(true)
          io.disconnect()
        }
      },
      { root: null, rootMargin: '240px 0px', threshold: 0.01 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [mediaReady])
  return (
    <div ref={ref} className={props.className}>
      {props.children(mediaReady)}
    </div>
  )
}

function ImagePreview(props: {
  url: string
  /** false → gray placeholder, no network fetch. */
  loadMedia: boolean
  interactive?: boolean
  failed?: boolean
  onFail?: (url: string) => void
  compact?: boolean
  linkMedia?: boolean
}) {
  const { url, loadMedia, interactive, failed, onFail, compact = false, linkMedia = false } = props

  if (failed) return null

  if (!loadMedia) {
    return (
      <div
        className={cn(
          'block w-full rounded-md bg-brezn-muted/10',
          compact ? 'min-h-36 max-h-64' : 'min-h-44 aspect-video max-h-[min(24rem,70vh)]',
        )}
        aria-hidden
      />
    )
  }

  const image = (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      className={`block w-full object-cover ${compact ? 'max-h-64' : ''}`}
      onError={() => onFail?.(url)}
    />
  )

  if (linkMedia) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={interactive ? stop : undefined}
        className="block overflow-hidden"
      >
        {image}
      </a>
    )
  }

  return <div className="block overflow-hidden">{image}</div>
}

function VideoPreview(props: {
  url: string
  loadMedia: boolean
  interactive?: boolean
  failed?: boolean
  onFail?: (url: string) => void
  compact?: boolean
  linkMedia?: boolean
}) {
  const { url, loadMedia, interactive, failed, onFail, compact = false, linkMedia = false } = props
  if (failed) return null

  if (!loadMedia) {
    return (
      <div
        className={cn(
          'block w-full rounded-md bg-brezn-muted/10',
          compact ? 'min-h-36 max-h-64' : 'min-h-44 aspect-video max-h-[min(24rem,70vh)]',
        )}
        aria-hidden
      />
    )
  }

  const video = (
    <video
      src={url}
      controls
      playsInline
      preload="metadata"
      className={`block w-full ${compact ? 'max-h-64' : ''}`}
      onError={() => onFail?.(url)}
    />
  )

  if (linkMedia) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={interactive ? stop : undefined}
        className="block overflow-hidden"
      >
        {video}
      </a>
    )
  }

  return (
    <div className="overflow-hidden" onClick={interactive ? stop : undefined}>
      {video}
    </div>
  )
}

export const PostContent = memo(function PostContent(props: {
  content: string
  tags?: string[][]
  interactive?: boolean
  compact?: boolean
  reactionButton?: React.ReactNode
  linkMedia?: boolean
  mediaStacked?: boolean
  client?: BreznNostrClient
  onOpenThread?: (evt: Event) => void
  onOpenProfile?: (pubkey: string) => void
}) {
  const {
    content,
    tags,
    interactive,
    compact = false,
    reactionButton,
    linkMedia = false,
    mediaStacked = false,
    client,
    onOpenThread,
    onOpenProfile,
  } = props

  const {
    parts,
    imageUrls,
    videoUrls,
    referencedEventIdsByPartKey,
    referencedProfilePubkeysByPartKey,
  } = useMemo(() => {
    const links = extractLinks(content)
    const refs = extractPostReferences(content)
    const profileRefs = extractProfileReferences(content)
    const refByRange = new Map<string, string>()
    const profileRefByRange = new Map<string, string>()
    for (const r of refs) refByRange.set(`${r.link.start}:${r.link.end}`, r.eventId)
    for (const r of profileRefs) profileRefByRange.set(`${r.link.start}:${r.link.end}`, r.pubkey)
    const urlStrings = uniqueUrls(links.map((u) => u.href))
    const imageUrlSet = new Set(urlStrings.filter(isLikelyImageUrl))
    const videoUrlSet = new Set(urlStrings.filter(isLikelyVideoUrl))

    // NIP-92 imeta: mime for extensionless URLs.
    for (const tag of tags ?? []) {
      if (tag[0] !== 'imeta') continue
      let taggedUrl: string | null = null
      let mimeType: string | null = null
      for (const entry of tag.slice(1)) {
        if (typeof entry !== 'string') continue
        if (entry.startsWith('url ')) taggedUrl = entry.slice(4).trim()
        if (entry.startsWith('m ')) mimeType = entry.slice(2).trim().toLowerCase()
      }
      if (!taggedUrl) continue
      if (!isSafeUrl(taggedUrl)) continue
      if (mimeType?.startsWith('image/')) imageUrlSet.add(taggedUrl)
      if (mimeType?.startsWith('video/')) videoUrlSet.add(taggedUrl)
    }

    const imageUrls = [...imageUrlSet]
    const videoUrls = [...videoUrlSet]

    const parts: Array<
      | { kind: 'text'; value: string }
      | { kind: 'link'; display: string; href: string; partKey: string }
    > = []
    const referencedEventIdsByPartKey: Record<string, string> = {}
    const referencedProfilePubkeysByPartKey: Record<string, string> = {}
    let cursor = 0
    for (let i = 0; i < links.length; i += 1) {
      const u = links[i]!
      const partKey = `${u.start}:${u.end}:${i}`
      if (u.start > cursor) parts.push({ kind: 'text', value: content.slice(cursor, u.start) })
      parts.push({ kind: 'link', display: u.display, href: u.href, partKey })
      const refId = refByRange.get(`${u.start}:${u.end}`)
      if (refId) referencedEventIdsByPartKey[partKey] = refId
      const profilePubkey = profileRefByRange.get(`${u.start}:${u.end}`)
      if (profilePubkey) referencedProfilePubkeysByPartKey[partKey] = profilePubkey
      cursor = u.end
    }
    if (cursor < content.length) parts.push({ kind: 'text', value: content.slice(cursor) })

    return {
      parts,
      imageUrls,
      videoUrls,
      referencedEventIdsByPartKey,
      referencedProfilePubkeysByPartKey,
    }
  }, [content, tags])

  const [failedMedia, setFailedMedia] = useState<Record<string, true>>({})
  const referencedEventIds = useMemo(
    () => [...new Set(Object.values(referencedEventIdsByPartKey))],
    [referencedEventIdsByPartKey],
  )
  const { byId: referencedPostsById, loadingIds } = useReferencedPosts(client, referencedEventIds)

  useEffect(() => {
    // Microtask: reset failed media without setState-in-effect lint noise.
    const schedule = (fn: () => void) => {
      if (typeof queueMicrotask === 'function') queueMicrotask(fn)
      else window.setTimeout(fn, 0)
    }
    schedule(() => setFailedMedia({}))
  }, [content])

  const mediaUrlSet = useMemo(() => new Set([...imageUrls, ...videoUrls]), [imageUrls, videoUrls])

  return (
    <div className="break-words">
      {parts.map((p, idx) => {
        if (p.kind === 'text') {
          const ellipsisMatch = p.value.match(/^(.*)\n\.\.\.(\s*)$/s)
          if (ellipsisMatch) {
            const body = (ellipsisMatch[1] ?? '').replace(/^\n+|\n+$/g, '')
            const trailingWs = ellipsisMatch[2] ?? ''
            return (
              <span key={idx}>
                {body}
                {'\n'}
                <span className="block text-center font-semibold text-brezn-muted">...</span>
                {trailingWs}
              </span>
            )
          }
          // Trim edge newlines (media stripped from flow).
          const text = p.value.replace(/^\n+|\n+$/g, '')
          return <span key={idx}>{text}</span>
        }

        if (!isSafeUrl(p.href)) {
          return <span key={idx}>{p.display}</span>
        }

        const isMediaUrl = mediaUrlSet.has(p.href)
        const isFailedMedia = Boolean(failedMedia[p.href])
        if (isMediaUrl && !isFailedMedia) return null

        const referencedEventId = referencedEventIdsByPartKey[p.partKey]
        if (referencedEventId) {
          return (
            <QuotedPostCard
              key={`${p.href}_${idx}`}
              event={referencedPostsById[referencedEventId]}
              loading={Boolean(loadingIds[referencedEventId])}
              href={p.href}
              display={p.display}
              compact={compact}
              interactive={interactive}
              onOpenThread={onOpenThread}
            />
          )
        }
        const referencedProfilePubkey = referencedProfilePubkeysByPartKey[p.partKey]
        if (referencedProfilePubkey && onOpenProfile) {
          return (
            <button
              key={`${p.href}_${idx}`}
              type="button"
              onClick={(e) => {
                if (interactive) stop(e)
                onOpenProfile(referencedProfilePubkey)
              }}
              className="focus:outline-none rounded break-words font-medium text-brezn-link underline underline-offset-2 hover:opacity-90"
            >
              {p.display}
            </button>
          )
        }
        return (
          <a
            key={`${p.href}_${idx}`}
            href={p.href}
            target="_blank"
            rel="noreferrer"
            onClick={interactive ? stop : undefined}
            className="focus:outline-none rounded break-words font-medium text-brezn-link underline underline-offset-2 hover:opacity-90"
          >
            {p.display}
          </a>
        )
      })}

      {(() => {
        const okVideos = videoUrls.filter((u) => !failedMedia[u])
        if (!okVideos.length) return null
        return (
          <div className={mediaGridClassName(mediaStacked, compact, okVideos.length)}>
            {okVideos.map((u) => (
              <DeferUntilInView key={u} className="overflow-hidden">
                {(ready) => (
                  <VideoPreview
                    url={u}
                    loadMedia={ready}
                    interactive={interactive}
                    failed={false}
                    onFail={(url) => setFailedMedia((prev) => ({ ...prev, [url]: true }))}
                    compact={compact}
                    linkMedia={linkMedia}
                  />
                )}
              </DeferUntilInView>
            ))}
          </div>
        )
      })()}

      {(() => {
        const okImages = imageUrls.filter((u) => !failedMedia[u])
        if (!okImages.length) return null
        return (
          <div className={mediaGridClassName(mediaStacked, compact, okImages.length)}>
            {okImages.map((u) => (
              <DeferUntilInView key={u} className="overflow-hidden">
                {(ready) => (
                  <ImagePreview
                    url={u}
                    loadMedia={ready}
                    interactive={interactive}
                    failed={false}
                    onFail={(url) => setFailedMedia((prev) => ({ ...prev, [url]: true }))}
                    compact={compact}
                    linkMedia={linkMedia}
                  />
                )}
              </DeferUntilInView>
            ))}
          </div>
        )
      })()}

      {/* Compact row: reactions */}
      {compact && reactionButton ? (
        <div className="mt-1.5 flex items-center justify-end">{reactionButton}</div>
      ) : null}
    </div>
  )
})
