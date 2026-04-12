import { FEED_PREVIEW_MAX_FLOWTEXT } from './constants'
import type { ExtractedLink } from './urls'
import { extractLinks, isLikelyImageUrl, isLikelyVideoUrl, uniqueUrls } from './urls'

function isPostReferenceLink(link: ExtractedLink): boolean {
  const display = link.display.trim().toLowerCase()
  const href = link.href.trim().toLowerCase()

  if (/^\[\[\s*e\s+[0-9a-f]{64}\s*\]\]$/.test(display)) return true
  if (display.startsWith('nostr:note1') || display.startsWith('nostr:nevent1') || display.startsWith('nostr:naddr1')) return true
  if (display.startsWith('note1') || display.startsWith('nevent1') || display.startsWith('naddr1')) return true
  if (/^https:\/\/njump\.me\/(note1|nevent1|naddr1)/.test(href)) return true
  if (/^https:\/\/njump\.me\/[0-9a-f]{64}$/.test(href)) return true

  return false
}

/** Feed list: truncate “flow” text, list image/video URLs after a marker (matches in-feed cards). */
export function truncateFeedCardContent(content: string): string {
  const links = extractLinks(content)
  let flowText = ''
  let cursor = 0
  for (const link of links) {
    flowText += content.slice(cursor, link.start)
    if (isPostReferenceLink(link)) flowText += content.slice(link.start, link.end)
    cursor = link.end
  }
  flowText += content.slice(cursor)

  const max = FEED_PREVIEW_MAX_FLOWTEXT
  const needsTruncation = flowText.length > max
  const truncatedText = needsTruncation ? `${flowText.slice(0, max).trimEnd()}\n...` : flowText

  const mediaUrls = uniqueUrls(links.map(l => l.href)).filter(
    url => isLikelyImageUrl(url) || isLikelyVideoUrl(url),
  )
  if (!mediaUrls.length) return truncatedText

  return `${truncatedText}\n\n${mediaUrls.join('\n')}`
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
