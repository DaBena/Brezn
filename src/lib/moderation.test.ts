import { describe, expect, it } from 'vitest'
import { contentMatchesMutedTerms, normalizeMutedTerms, normalizeTextForMatch } from './moderation'

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
    const terms = normalizeMutedTerms(['telegram.me'])
    expect(contentMatchesMutedTerms('join us at https://tELEgram.me/abc', terms)).toBe(true)
  })

  it('contentMatchesMutedTerms returns false when no terms', () => {
    expect(contentMatchesMutedTerms('anything', [])).toBe(false)
  })
})

