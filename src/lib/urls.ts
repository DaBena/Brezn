export type ExtractedUrl = {
  raw: string
  url: string
  start: number
  end: number
}

export type ExtractedLink = {
  raw: string
  display: string
  href: string
  start: number
  end: number
}

// Rough URL matcher: good enough for plaintext posts.
const URL_RE = /\bhttps?:\/\/[^\s<>()]+/g

// Nostr links in plaintext (NIP-19 identifiers).
// We keep this intentionally rough (plaintext posts, no full URI parser).
const NOSTR_URI_RE = /\bnostr:(nprofile1[02-9ac-hj-np-z]+|npub1[02-9ac-hj-np-z]+|note1[02-9ac-hj-np-z]+|nevent1[02-9ac-hj-np-z]+|naddr1[02-9ac-hj-np-z]+)\b/gi
const NIP19_BARE_RE = /\b(nprofile1[02-9ac-hj-np-z]+|npub1[02-9ac-hj-np-z]+|note1[02-9ac-hj-np-z]+|nevent1[02-9ac-hj-np-z]+|naddr1[02-9ac-hj-np-z]+)\b/gi

// Remove punctuation that often follows URLs in prose.
function trimTrailingPunctuation(s: string): string {
  return s.replace(/[),.\]!?:;"'’]+$/g, '')
}

export function extractUrls(text: string): ExtractedUrl[] {
  const input = (text ?? '').toString()
  const out: ExtractedUrl[] = []
  URL_RE.lastIndex = 0
  for (;;) {
    const m = URL_RE.exec(input)
    if (!m) break
    const raw = m[0]
    const trimmed = trimTrailingPunctuation(raw)
    const start = m.index
    const end = m.index + trimmed.length
    out.push({ raw, url: trimmed, start, end })
    // If we trimmed, advance regex position accordingly to avoid infinite loops.
    if (trimmed.length !== raw.length) URL_RE.lastIndex = m.index + raw.length
  }
  return out
}

function toNostrHref(display: string): string {
  const s = display.trim()
  if (!s) return s
  const lower = s.toLowerCase()
  const NIP19_PREFIXES = ['nprofile1', 'npub1', 'note1', 'nevent1', 'naddr1']
  
  if (lower.startsWith('nostr:')) {
    return `https://njump.me/${s.slice('nostr:'.length)}`
  }
  if (NIP19_PREFIXES.some(prefix => lower.startsWith(prefix))) {
    return `https://njump.me/${s}`
  }
  return s
}

export function extractLinks(text: string): ExtractedLink[] {
  const input = (text ?? '').toString()
  const matches: Array<{ raw: string; display: string; start: number; end: number }> = []

  const collect = (re: RegExp) => {
    re.lastIndex = 0
    for (;;) {
      const m = re.exec(input)
      if (!m) break
      const raw = m[0]
      const trimmed = trimTrailingPunctuation(raw)
      const start = m.index
      const end = m.index + trimmed.length
      matches.push({ raw, display: trimmed, start, end })
      if (trimmed.length !== raw.length) re.lastIndex = m.index + raw.length
    }
  }

  collect(URL_RE)
  collect(NOSTR_URI_RE)
  collect(NIP19_BARE_RE)

  matches.sort((a, b) => (a.start !== b.start ? a.start - b.start : b.end - b.start - (a.end - a.start)))

  const out: ExtractedLink[] = []
  let cursorEnd = -1
  for (const m of matches) {
    if (m.start < cursorEnd) continue // avoid overlaps (e.g. bare nip19 inside nostr:...)
    const href = m.display.startsWith('http://') || m.display.startsWith('https://') ? m.display : toNostrHref(m.display)
    out.push({ raw: m.raw, display: m.display, href, start: m.start, end: m.end })
    cursorEnd = m.end
  }
  return out
}

export function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of urls) {
    const key = u.trim()
    if (!key) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg']
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v', '.ogv']

function hasExtension(url: string, extensions: string[]): boolean {
  try {
    const u = new URL(url)
    const path = u.pathname.toLowerCase()
    return extensions.some(ext => path.endsWith(ext))
  } catch {
    return false
  }
}

export function isLikelyImageUrl(url: string): boolean {
  return hasExtension(url, IMAGE_EXTENSIONS)
}

export function isLikelyVideoUrl(url: string): boolean {
  return hasExtension(url, VIDEO_EXTENSIONS)
}

// Validate that a URL is safe to use in href attributes
export function isSafeUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  
  const trimmed = url.trim()
  if (!trimmed) return false
  
  // Allow Nostr identifiers (npub, nprofile, note, nevent, naddr)
  // These are converted to https://njump.me/ links in extractLinks
  if (/^(npub1|nprofile1|note1|nevent1|naddr1)[02-9ac-hj-np-z]+$/i.test(trimmed)) {
    return true
  }
  
  // Allow nostr: protocol
  if (trimmed.toLowerCase().startsWith('nostr:')) {
    return true
  }
  
  // Only allow http and https protocols
  try {
    const parsed = new URL(trimmed)
    const protocol = parsed.protocol.toLowerCase()
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    // Invalid URL format
    return false
  }
}
