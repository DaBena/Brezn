import { describe, expect, it } from 'vitest'
import {
  contentLooksLikeUnspacedBlob,
  contentMatchesMutedTerms,
  normalizeMutedTerms,
  normalizeTextForMatch,
} from './moderation'
import { UNSPACED_BLOB_MIN_LENGTH } from './constants'

describe('moderation', () => {
  it('normalizeTextForMatch lowercases and collapses whitespace', () => {
    expect(normalizeTextForMatch('  Hello \n  WORLD\t\t!!  ')).toBe('hello world !!')
  })

  it('normalizeMutedTerms de-dupes, trims and limits', () => {
    expect(normalizeMutedTerms(['', '  Spam  ', 'spam', 'SPAM', 'ok'])).toEqual(['spam', 'ok'])
  })

  it('contentMatchesMutedTerms matches phrases across newlines', () => {
    const terms = normalizeMutedTerms(['hello world'])
    expect(contentMatchesMutedTerms('Hello\nWorld', terms)).toBe(true)
  })

  it('contentMatchesMutedTerms matches substrings', () => {
    const terms = normalizeMutedTerms(['evil.example'])
    expect(contentMatchesMutedTerms('join us at https://EVIL.example/abc', terms)).toBe(true)
  })

  it('contentMatchesMutedTerms returns false when no terms', () => {
    expect(contentMatchesMutedTerms('anything', [])).toBe(false)
  })

  it('contentLooksLikeUnspacedBlob catches long base64 walls', () => {
    const blob = `${'A'.repeat(40)}+${'/'.repeat(40)}${'xYz0'.repeat(60)}==`
    expect(blob.length).toBeGreaterThan(UNSPACED_BLOB_MIN_LENGTH)
    expect(contentLooksLikeUnspacedBlob(blob)).toBe(true)
  })

  it('contentLooksLikeUnspacedBlob keeps normal prose', () => {
    expect(
      contentLooksLikeUnspacedBlob('Best Brezn in town, still warm from the oven. '.repeat(8)),
    ).toBe(false)
  })

  it('contentLooksLikeUnspacedBlob keeps CJK without spaces', () => {
    expect(contentLooksLikeUnspacedBlob('布列兹尼在镇上很好吃'.repeat(40))).toBe(false)
  })

  it('contentLooksLikeUnspacedBlob keeps a lone URL', () => {
    expect(contentLooksLikeUnspacedBlob(`https://example.com/${'a'.repeat(300)}`)).toBe(false)
  })

  it('contentLooksLikeUnspacedBlob keeps YouTube links', () => {
    const watch = `https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${'PLabc'.repeat(40)}`
    expect(contentLooksLikeUnspacedBlob(watch)).toBe(false)
    expect(contentLooksLikeUnspacedBlob(`song of the day\nhttps://youtu.be/dQw4w9WgXcQ`)).toBe(
      false,
    )
  })

  it('contentLooksLikeUnspacedBlob still drops a dump that happens to include a URL', () => {
    const blob = `${'A'.repeat(40)}+${'/'.repeat(40)}${'xYz0'.repeat(60)}==`
    expect(
      contentLooksLikeUnspacedBlob(`${blob}\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ`),
    ).toBe(true)
  })
})
