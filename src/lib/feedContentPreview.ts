import type { Event } from './nostrPrimitives'
import { FEED_PREVIEW_MAX_FLOWTEXT, SEARCH_SNIPPET_LEAD } from './constants'
import { isNip52CalendarKind, nip52FeedCardPostContent } from './nip52'
import { indexOfQueryWord } from './nip50Search'
import type { ExtractedLink } from './urls'
import {
  collectImetaMediaUrls,
  extractLinks,
  isLikelyImageUrl,
  isLikelyVideoUrl,
  uniqueUrls,
} from './urls'

/** Plain text for feed/profile list cards — kind 1 uses `content`, NIP-52 uses tags (same `PostContent` path). */
export function feedEventCardPlainText(evt: Event): string {
  return isNip52CalendarKind(evt.kind) ? nip52FeedCardPostContent(evt) : (evt.content ?? '')
}

function isPostReferenceLink(link: ExtractedLink): boolean {
  const display = link.display.trim().toLowerCase()
  const href = link.href.trim().toLowerCase()

  if (/^\[\[\s*e\s+[0-9a-f]{64}\s*\]\]$/.test(display)) return true
  if (
    display.startsWith('nostr:note1') ||
    display.startsWith('nostr:nevent1') ||
    display.startsWith('nostr:naddr1')
  )
    return true
  if (display.startsWith('note1') || display.startsWith('nevent1') || display.startsWith('naddr1'))
    return true
  if (/^https:\/\/njump\.me\/(note1|nevent1|naddr1)/.test(href)) return true
  if (/^https:\/\/njump\.me\/[0-9a-f]{64}$/.test(href)) return true

  return false
}

function feedCardFlowAndMedia(
  content: string,
  tags?: string[][],
): { flowText: string; mediaSuffix: string } {
  const links = extractLinks(content)
  let flowText = ''
  let cursor = 0
  for (const link of links) {
    flowText += content.slice(cursor, link.start)
    const inlineMedia = isLikelyImageUrl(link.href) || isLikelyVideoUrl(link.href)
    // Keep post refs + ordinary URLs in the preview; only strip inline media (listed below).
    if (isPostReferenceLink(link) || !inlineMedia) {
      flowText += content.slice(link.start, link.end)
    }
    cursor = link.end
  }
  flowText += content.slice(cursor)
  flowText = flowText.replace(/^\n+/, '')

  const imeta = collectImetaMediaUrls(tags)
  const mediaUrls = uniqueUrls([
    ...links.map((l) => l.href).filter((url) => isLikelyImageUrl(url) || isLikelyVideoUrl(url)),
    ...imeta.imageUrls,
    ...imeta.videoUrls,
  ])
  return {
    flowText,
    mediaSuffix: mediaUrls.length ? `\n\n${mediaUrls.join('\n')}` : '',
  }
}

function clipFlowText(flowText: string, max: number): string {
  if (flowText.length <= max) return flowText
  return `${flowText.slice(0, max).trimEnd()}\n...`
}

/** Feed list: truncate “flow” text, list image/video URLs after a marker (matches in-feed cards). */
export function truncateFeedCardContent(content: string, tags?: string[][]): string {
  const { flowText, mediaSuffix } = feedCardFlowAndMedia(content, tags)
  return `${clipFlowText(flowText, FEED_PREVIEW_MAX_FLOWTEXT)}${mediaSuffix}`
}

/** Search list: start the preview near the first query hit so the match is visible. */
export function truncateFeedCardContentAroundQuery(
  content: string,
  query: string,
  tags?: string[][],
): string {
  const { flowText, mediaSuffix } = feedCardFlowAndMedia(content, tags)
  const q = query.trim().toLowerCase()
  const idx = q ? indexOfQueryWord(flowText, q) : -1
  let window = flowText
  if (idx > SEARCH_SNIPPET_LEAD) {
    window = `...\n${flowText.slice(idx - SEARCH_SNIPPET_LEAD)}`
  }
  return `${clipFlowText(window, FEED_PREVIEW_MAX_FLOWTEXT)}${mediaSuffix}`
}

/** Profile list: truncate by flow-text length but keep links inline (legacy profile card behavior). */
export function truncateProfileCardContent(content: string): string {
  const links = extractLinks(content)
  let flowTextLength = 0
  let cursor = 0
  for (const link of links) {
    flowTextLength += content.slice(cursor, link.start).length
    cursor = link.end
  }
  flowTextLength += content.slice(cursor).length

  const max = FEED_PREVIEW_MAX_FLOWTEXT
  if (flowTextLength <= max) return content

  cursor = 0
  let result = ''
  let flowUsed = 0
  for (const link of links) {
    const textBefore = content.slice(cursor, link.start)
    const len = textBefore.length
    if (flowUsed + len <= max) {
      result += textBefore
      result += content.slice(link.start, link.end)
      flowUsed += len
      cursor = link.end
    } else {
      const remaining = max - flowUsed
      result += textBefore.slice(0, remaining) + '\n...'
      return result
    }
  }
  const textAfter = content.slice(cursor)
  const remaining = max - flowUsed
  result += textAfter.slice(0, remaining) + '\n...'
  return result
}
