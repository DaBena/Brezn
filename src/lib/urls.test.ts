import { describe, expect, test } from 'vitest'
import {
  blueskyVideoPosterUrl,
  extractLinks,
  extractUrls,
  isHlsPlaylistUrl,
  isLikelyImageUrl,
  isLikelyVideoUrl,
  uniqueUrls,
} from './urls'

describe('extractUrls', () => {
  test('extracts http/https urls and trims trailing punctuation', () => {
    const text =
      "See https://example.com/a.png, then (https://foo.bar/x.jpg). End: https://x.y/z?q=1. And don't take https://a/b.png)."
    const urls = extractUrls(text).map((x) => x.url)
    expect(urls).toEqual([
      'https://example.com/a.png',
      'https://foo.bar/x.jpg',
      'https://x.y/z?q=1',
      'https://a/b.png',
    ])
  })

  test('returns empty for no urls', () => {
    expect(extractUrls('hello world')).toEqual([])
  })
})

describe('uniqueUrls', () => {
  test('dedupes and preserves order', () => {
    expect(uniqueUrls([' a ', 'b', 'a', '', 'b '])).toEqual(['a', 'b'])
  })
})

describe('extractLinks', () => {
  test('extracts http/https urls', () => {
    const links = extractLinks('go to https://example.com/x?q=1 now')
    expect(links.map((l) => l.href)).toEqual(['https://example.com/x?q=1'])
    expect(links.map((l) => l.display)).toEqual(['https://example.com/x?q=1'])
  })

  test('extracts nostr:nprofile and maps to njump.me', () => {
    const text =
      'Profile: nostr:nprofile1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq. done'
    const links = extractLinks(text)
    expect(links).toHaveLength(1)
    expect(links[0]!.display).toBe(
      'nostr:nprofile1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
    )
    expect(links[0]!.href).toBe(
      'https://njump.me/nprofile1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
    )
  })

  test('extracts bare nprofile and maps to njump.me', () => {
    const text = 'nprofile1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq!'
    const links = extractLinks(text)
    expect(links).toHaveLength(1)
    expect(links[0]!.display).toBe(
      'nprofile1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
    )
    expect(links[0]!.href).toBe(
      'https://njump.me/nprofile1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
    )
  })
})

describe('isLikelyImageUrl', () => {
  test('detects common image extensions', () => {
    expect(isLikelyImageUrl('https://example.com/a.png')).toBe(true)
    expect(isLikelyImageUrl('https://example.com/a.JPG')).toBe(true)
    expect(isLikelyImageUrl('https://example.com/a.jpeg?x=1')).toBe(true)
    expect(isLikelyImageUrl('https://example.com/a.svg#frag')).toBe(true)
  })

  test('rejects non-image urls', () => {
    expect(isLikelyImageUrl('https://example.com/a.txt')).toBe(false)
    expect(isLikelyImageUrl('not-a-url')).toBe(false)
  })
})

describe('isLikelyVideoUrl', () => {
  test('detects common video extensions', () => {
    expect(isLikelyVideoUrl('https://example.com/a.mp4')).toBe(true)
    expect(isLikelyVideoUrl('https://example.com/a.WEBM')).toBe(true)
    expect(isLikelyVideoUrl('https://example.com/a.mov?x=1')).toBe(true)
    expect(isLikelyVideoUrl('https://example.com/a.m4v#frag')).toBe(true)
    expect(isLikelyVideoUrl('https://video.bsky.app/watch/did:plc:abc/bafy/playlist.m3u8')).toBe(
      true,
    )
  })

  test('rejects non-video urls', () => {
    expect(isLikelyVideoUrl('https://example.com/a.png')).toBe(false)
    expect(isLikelyVideoUrl('https://bsky.app/profile/someone/post/abc')).toBe(false)
    expect(isLikelyVideoUrl('not-a-url')).toBe(false)
  })
})

describe('bluesky HLS helpers', () => {
  const playlist = 'https://video.bsky.app/watch/did%3Aplc%3Aexample/bafy/playlist.m3u8'

  test('detects m3u8 playlists', () => {
    expect(isHlsPlaylistUrl(playlist)).toBe(true)
    expect(isHlsPlaylistUrl('https://example.com/a.mp4')).toBe(false)
  })

  test('maps a Bluesky playlist to its thumbnail', () => {
    expect(blueskyVideoPosterUrl(playlist)).toBe(
      'https://video.bsky.app/watch/did%3Aplc%3Aexample/bafy/thumbnail.jpg',
    )
    expect(blueskyVideoPosterUrl('https://example.com/a.m3u8')).toBeNull()
    expect(blueskyVideoPosterUrl('https://video.bsky.app/watch/x/thumbnail.jpg')).toBeNull()
  })
})
