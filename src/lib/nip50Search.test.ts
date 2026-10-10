import { describe, expect, it } from 'vitest'
import { generateSecretKey, getPublicKey, nip19 } from './nostrPrimitives'
import {
  buildNip50SearchFilters,
  buildPosterProbeFilters,
  buildPubkeyLookupFilters,
  keepSearchPerson,
  parseSearchTargetPubkey,
  searchEventMatchesQuery,
  searchResultMatchesQuery,
} from './nip50Search'
import { NOSTR_KINDS } from './breznNostr'
import { SEARCH_QUERY_LIMIT } from './constants'
import type { Event } from './nostrPrimitives'

describe('parseSearchTargetPubkey', () => {
  it('accepts 64-char hex', () => {
    const hex = 'a'.repeat(64)
    expect(parseSearchTargetPubkey(`  ${hex}  `)).toBe(hex)
  })

  it('decodes npub', () => {
    const sk = generateSecretKey()
    const pk = getPublicKey(sk)
    const npub = nip19.npubEncode(pk)
    expect(parseSearchTargetPubkey(npub)).toBe(pk.toLowerCase())
  })

  it('returns null for free text', () => {
    expect(parseSearchTargetPubkey('brezn')).toBeNull()
  })
})

describe('buildNip50SearchFilters', () => {
  it('sends search to the configured kinds with a limit', () => {
    const filters = buildNip50SearchFilters('  brezn ')
    expect(filters).toHaveLength(1)
    expect(filters[0]?.search).toBe('brezn')
    expect(filters[0]?.limit).toBe(SEARCH_QUERY_LIMIT)
    expect(filters[0]?.kinds).toContain(NOSTR_KINDS.note)
    expect(filters[0]?.kinds).toContain(NOSTR_KINDS.metadata)
  })

  it('is empty for blank query', () => {
    expect(buildNip50SearchFilters('   ')).toEqual([])
  })
})

describe('buildPubkeyLookupFilters', () => {
  it('looks up metadata and posts for a hex pubkey', () => {
    const pk = 'b'.repeat(64)
    const filters = buildPubkeyLookupFilters(pk)
    expect(filters).toEqual([
      { kinds: [0], authors: [pk], limit: 5 },
      { kinds: [1, 31922, 31923], authors: [pk], limit: SEARCH_QUERY_LIMIT },
    ])
  })
})

describe('buildPosterProbeFilters', () => {
  it('asks each pubkey for a single root post', () => {
    const pk = 'b'.repeat(64)
    expect(buildPosterProbeFilters([` ${pk} `, pk, 'nope'])).toEqual([
      { kinds: [1, 31922, 31923], authors: [pk], limit: 1 },
    ])
  })
})

describe('keepSearchPerson', () => {
  const pk = 'c'.repeat(64)
  it('keeps a name hit that has posted', () => {
    expect(keepSearchPerson(pk, null, new Set([pk]))).toBe(true)
  })
  it('drops an empty profile from free-text search', () => {
    expect(keepSearchPerson(pk, null, new Set())).toBe(false)
  })
  it('keeps an identifier lookup even without posts', () => {
    expect(keepSearchPerson(pk, pk, new Set())).toBe(true)
  })
})

describe('searchEventMatchesQuery', () => {
  const evt: Event = {
    id: '1',
    pubkey: 'c'.repeat(64),
    kind: 1,
    content: 'Best Brezn in town',
    created_at: 1,
    tags: [],
    sig: 's',
  }

  it('matches content', () => {
    expect(searchEventMatchesQuery(evt, 'brezn')).toBe(true)
    expect(searchEventMatchesQuery(evt, 'xyzzy')).toBe(false)
  })

  it('rejects unrelated notes', () => {
    const unrelated: Event = { ...evt, content: 'hello from the firehose' }
    expect(searchEventMatchesQuery(unrelated, 'brezn')).toBe(false)
  })

  it('matches hashtag tags so hits without the word in content still count', () => {
    const tagged: Event = { ...evt, content: 'lunch', tags: [['t', 'brezn']] }
    expect(searchEventMatchesQuery(tagged, 'brezn')).toBe(true)
  })

  it('ignores the query when it only appears inside a URL', () => {
    const linked: Event = {
      ...evt,
      content: 'read more https://example.com/brezn-review',
    }
    expect(searchEventMatchesQuery(linked, 'brezn')).toBe(false)
  })

  it('does not treat a picture URL in kind 0 as a people hit', () => {
    const kind0: Event = {
      ...evt,
      kind: 0,
      content: JSON.stringify({
        name: 'Alice',
        picture: 'https://cdn.example.com/brezn.png',
        about: 'hello',
      }),
    }
    expect(searchEventMatchesQuery(kind0, 'brezn')).toBe(false)
  })

  it('matches a profile name', () => {
    const kind0: Event = {
      ...evt,
      kind: 0,
      content: JSON.stringify({ name: 'Brezn Baker', about: 'hi' }),
    }
    expect(searchEventMatchesQuery(kind0, 'brezn')).toBe(true)
  })
})

describe('searchResultMatchesQuery', () => {
  it('keeps posts from an identifier lookup even without the query in content', () => {
    const pk = 'c'.repeat(64)
    const evt: Event = {
      id: '1',
      pubkey: pk,
      kind: 1,
      content: 'hello from the firehose',
      created_at: 1,
      tags: [],
      sig: 's',
    }
    expect(searchResultMatchesQuery(evt, 'nprofile1qqsomething', pk)).toBe(true)
    expect(searchResultMatchesQuery(evt, 'brezn', null)).toBe(false)
  })
})
