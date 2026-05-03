import {
  collectImetaMediaUrls,
  extractLinks,
  extractUrls,
  isLikelyImageUrl,
  isLikelyVideoUrl,
  uniqueUrls,
} from './urls'

/** Drop lines that consist only of a URL present in `mediaUrlSet` (e.g. Blossom-only lines). */
export function stripLinesThatAreOnlyMediaUrls(
  content: string,
  mediaUrlSet: ReadonlySet<string>,
): string {
  const lines = content.split(/\r?\n/)
  const kept: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) {
      kept.push('')
      continue
    }
    const urls = extractUrls(t)
    if (urls.length === 1 && urls[0].url === t && mediaUrlSet.has(t)) continue
    kept.push(line)
  }
  return kept.join('\n')
}

export function trimOuterNewlines(s: string): string {
  return s.replace(/^\n+/, '').replace(/\n+$/, '')
}

export function mediaSetsFromPost(
  content: string,
  tags?: string[][],
): {
  imageUrls: string[]
  videoUrls: string[]
  mediaUrlSet: Set<string>
} {
  const links = extractLinks(content)
  const urlStrings = uniqueUrls(links.map((u) => u.href))
  const imageUrlSet = new Set(urlStrings.filter(isLikelyImageUrl))
  const videoUrlSet = new Set(urlStrings.filter(isLikelyVideoUrl))
  const imeta = collectImetaMediaUrls(tags)
  for (const u of imeta.imageUrls) imageUrlSet.add(u)
  for (const u of imeta.videoUrls) videoUrlSet.add(u)
  const imageUrls = [...imageUrlSet]
  const videoUrls = [...videoUrlSet]
  const mediaUrlSet = new Set<string>([...imageUrls, ...videoUrls])
  return { imageUrls, videoUrls, mediaUrlSet }
}

export function preparePostContentSource(
  content: string,
  tags?: string[][],
): {
  imageUrls: string[]
  videoUrls: string[]
  proseContent: string
} {
  const { imageUrls, videoUrls, mediaUrlSet } = mediaSetsFromPost(content, tags)
  const proseContent = trimOuterNewlines(stripLinesThatAreOnlyMediaUrls(content, mediaUrlSet))
  return { imageUrls, videoUrls, proseContent }
}

export function proseForPostBodyParts(content: string, tags?: string[][]): string {
  return preparePostContentSource(content, tags).proseContent
}
