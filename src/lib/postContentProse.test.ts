import { describe, expect, it } from 'vitest'
import {
  mediaSetsFromPost,
  proseForPostBodyParts,
  stripLinesThatAreOnlyMediaUrls,
  trimOuterNewlines,
} from './postContentProse'

/** Quad-image note shape without Blossom / other builder hosts in fixtures. */
const MULTI_IMAGE_NOTE = {
  content:
    'https://example.com/m/a\n' +
    'https://example.com/m/b\n' +
    'https://example.com/m/c\n' +
    'https://example.com/m/d\n' +
    '\n' +
    'Caption after URLs.',
  tags: [
    ['g', 'uabcdef1'],
    ['imeta', 'url https://example.com/m/a', 'm image/jpeg'],
    ['imeta', 'url https://example.com/m/b', 'm image/jpeg'],
    ['imeta', 'url https://example.com/m/c', 'm image/jpeg'],
    ['imeta', 'url https://example.com/m/d', 'm image/jpeg'],
  ] as string[][],
}

describe('stripLinesThatAreOnlyMediaUrls', () => {
  it('drops lines that are only a URL listed in the media set', () => {
    const { mediaUrlSet: set } = mediaSetsFromPost(MULTI_IMAGE_NOTE.content, MULTI_IMAGE_NOTE.tags)
    expect(set.size).toBe(4)
    const stripped = stripLinesThatAreOnlyMediaUrls(MULTI_IMAGE_NOTE.content, set)
    expect(stripped).toContain('Caption after URLs.')
    expect(stripped).not.toContain('example.com/m/a')
  })

  it('keeps a line that mentions a media URL but is not URL-only', () => {
    const set = new Set(['https://example.com/a.jpg'])
    const s = stripLinesThatAreOnlyMediaUrls('see https://example.com/a.jpg here', set)
    expect(s).toBe('see https://example.com/a.jpg here')
  })
})

describe('trimOuterNewlines', () => {
  it('strips leading and trailing newlines only', () => {
    expect(trimOuterNewlines('\n\nhello\n')).toBe('hello')
    expect(trimOuterNewlines('a\n\nb')).toBe('a\n\nb')
  })
})

describe('proseForPostBodyParts', () => {
  it('returns caption-only prose after stripping media-only lines', () => {
    expect(proseForPostBodyParts(MULTI_IMAGE_NOTE.content, MULTI_IMAGE_NOTE.tags)).toBe(
      'Caption after URLs.',
    )
  })
})
