import { memo, useEffect, useMemo, useState } from 'react'
import { extractLinks, isLikelyImageUrl, isLikelyVideoUrl, uniqueUrls } from '../lib/urls'

function stop(e: React.SyntheticEvent) {
  e.stopPropagation()
}

function ImagePreview(props: {
  url: string
  interactive?: boolean
  failed?: boolean
  onFail?: (url: string) => void
  compact?: boolean
}) {
  const { url, failed, onFail, compact = false } = props
  
  if (failed) return null
  
  return (
    <div className="block overflow-hidden">
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        className={`block w-full object-cover ${compact ? 'max-h-64' : ''}`}
        onError={() => onFail?.(url)}
      />
    </div>
  )
}

function VideoPreview(props: {
  url: string
  interactive?: boolean
  failed?: boolean
  onFail?: (url: string) => void
  compact?: boolean
}) {
  const { url, interactive, failed, onFail, compact = false } = props
  if (failed) return null
  return (
    <div className="overflow-hidden" onClick={interactive ? stop : undefined}>
      <video
        src={url}
        controls
        playsInline
        preload="metadata"
        className={`block w-full ${compact ? 'max-h-64' : ''}`}
        onError={() => onFail?.(url)}
      />
    </div>
  )
}

export const PostContent = memo(function PostContent(props: { 
  content: string
  interactive?: boolean
  compact?: boolean
  reactionButton?: React.ReactNode
}) {
  const { content, interactive, compact = false, reactionButton } = props

  const { parts, imageUrls, videoUrls } = useMemo(() => {
    const links = extractLinks(content)
    const urlStrings = uniqueUrls(links.map(u => u.href))
    const imageUrls = urlStrings.filter(isLikelyImageUrl)
    const videoUrls = urlStrings.filter(isLikelyVideoUrl)

    const parts: Array<
      { kind: 'text'; value: string } | { kind: 'link'; display: string; href: string }
    > = []
    let cursor = 0
    for (const u of links) {
      if (u.start > cursor) parts.push({ kind: 'text', value: content.slice(cursor, u.start) })
      parts.push({ kind: 'link', display: u.display, href: u.href })
      cursor = u.end
    }
    if (cursor < content.length) parts.push({ kind: 'text', value: content.slice(cursor) })

    return { parts, imageUrls, videoUrls }
  }, [content])

  const [failedMedia, setFailedMedia] = useState<Record<string, true>>({})

  useEffect(() => {
    // Avoid synchronous setState inside effect body (eslint/perf rule).
    const schedule = (fn: () => void) => {
      if (typeof queueMicrotask === 'function') queueMicrotask(fn)
      else window.setTimeout(fn, 0)
    }
    schedule(() => setFailedMedia({}))
  }, [content])

  const mediaUrlSet = useMemo(() => new Set([...imageUrls, ...videoUrls]), [imageUrls, videoUrls])

  return (
    <div className="break-words">
      <div className="break-words">
        {parts.map((p, idx) => {
          if (p.kind === 'text') return <span key={idx}>{p.value}</span>
          const isMediaUrl = mediaUrlSet.has(p.href)
          const isFailedMedia = Boolean(failedMedia[p.href])
          if (isMediaUrl && !isFailedMedia) return null
          return (
            <a
              key={`${p.href}_${idx}`}
              href={p.href}
              target="_blank"
              rel="noreferrer"
              onClick={interactive ? stop : undefined}
              className="break-words font-medium text-brezn-gold underline underline-offset-2 hover:opacity-90 focus:outline-none rounded"
            >
              {p.display}
            </a>
          )
        })}
      </div>

      {videoUrls.length ? (
        <div className={[
          'mt-2 grid gap-2 w-full',
          compact 
            ? (videoUrls.length === 1 ? 'grid-cols-1' : videoUrls.length <= 4 ? 'grid-cols-2' : 'grid-cols-4')
            : (videoUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'),
        ].join(' ')}>
          {videoUrls.map(u => (
            <div key={u} className="overflow-hidden">
              <VideoPreview
                url={u}
                interactive={interactive}
                failed={Boolean(failedMedia[u])}
                onFail={url => setFailedMedia(prev => ({ ...prev, [url]: true }))}
                compact={compact}
              />
            </div>
          ))}
        </div>
      ) : null}

      {imageUrls.length ? (
        <div className={[
          'mt-2 grid gap-2 w-full',
          compact 
            ? (imageUrls.length === 1 ? 'grid-cols-1' : imageUrls.length <= 4 ? 'grid-cols-2' : 'grid-cols-4')
            : (imageUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'),
        ].join(' ')}>
          {imageUrls.map(u => (
            <div key={u} className="overflow-hidden">
              <ImagePreview
                url={u}
                interactive={interactive}
                failed={Boolean(failedMedia[u])}
                onFail={url => setFailedMedia(prev => ({ ...prev, [url]: true }))}
                compact={compact}
              />
            </div>
          ))}
        </div>
      ) : null}
      
      {/* Reaction button in a compact row */}
      {compact && reactionButton ? (
        <div className="mt-1.5 flex items-center justify-end">
          {reactionButton}
        </div>
      ) : null}
    </div>
  )
})

