import { describe, expect, it } from 'vitest'
import geohash from 'ngeohash'
import type { Event } from './nostrPrimitives'
import {
  buildFeedGeoFilters,
  feedRootEventMatchesQueryCells,
  filterFeedEventsByQuery,
  getQueryCellsForFeed,
} from './feedGeoMatch'
import { GEOHASH_BASE32_PREFIXES } from './geo'
import { NIP52_KIND_DATE_EVENT } from './nip52'

function note(gTags: string[]): Event {
  return {
    id: '1',
    pubkey: 'p',
    kind: 1,
    content: '',
    created_at: 1,
    tags: gTags.map((g) => ['g', g]),
    sig: 's',
  }
}

describe('getQueryCellsForFeed', () => {
  it('uses all 32 base32 prefixes for precision 0', () => {
    const cells = getQueryCellsForFeed('u09vw', 0)
    expect(cells).toEqual([...GEOHASH_BASE32_PREFIXES])
    expect(cells).toHaveLength(32)
  })

  it('queries the prefix and its eight neighbors at every other length', () => {
    for (const len of [1, 2, 3, 4, 5]) {
      const cells = getQueryCellsForFeed('u09vw', len)
      const prefix = 'u09vw'.slice(0, len)
      const expected = [prefix]
      const seen = new Set(expected)
      for (const n of geohash.neighbors(prefix)) {
        const h = n.toLowerCase()
        if (seen.has(h)) continue
        seen.add(h)
        expected.push(h)
      }
      expect(cells).toEqual(expected)
    }
  })

  it('is a full 3×3 once the cell no longer touches the pole', () => {
    for (const len of [2, 3, 4, 5]) {
      expect(getQueryCellsForFeed('u09vw', len)).toHaveLength(9)
    }
    // `u` runs to 90°N, so some of the eight directions collapse onto the same hash.
    expect(getQueryCellsForFeed('u09vw', 1).length).toBeLessThan(9)
  })

  it('uses the same 3×3 for every position inside u0 at length 2', () => {
    const fromEdge = getQueryCellsForFeed('u0xzz', 2)
    const fromCorner = getQueryCellsForFeed('u0pzz', 2)
    const fromInterior = getQueryCellsForFeed('u0mzz', 2)
    expect(fromEdge).toEqual(fromCorner)
    expect(fromEdge).toEqual(fromInterior)
    expect(fromEdge[0]).toBe('u0')
    expect(fromEdge).toContain('u2')
  })
})

describe('buildFeedGeoFilters', () => {
  const base = { kinds: [1, 31923], limit: 200 }

  it('length ≥ 2 is one filter covering the cell and its neighbors', () => {
    expect(buildFeedGeoFilters('u09vw', 2, base)).toEqual([
      { ...base, '#g': getQueryCellsForFeed('u09vw', 2) },
    ])
    expect(buildFeedGeoFilters('u09vw', 3, base)).toEqual([
      { ...base, '#g': getQueryCellsForFeed('u09vw', 3) },
    ])
  })

  it('length 0/1 add a second home-cell filter for length≥2 prefixes', () => {
    const home = ['u0', 'u09', 'u09v', 'u09vw']
    const wide = buildFeedGeoFilters('u09vw', 0, base)
    expect(wide).toHaveLength(2)
    expect(wide[0]).toMatchObject({ ...base, '#g': [...GEOHASH_BASE32_PREFIXES] })
    expect(wide[1]).toMatchObject({ ...base, '#g': home })

    const len1 = buildFeedGeoFilters('u09vw', 1, base)
    expect(len1).toEqual([
      { ...base, '#g': getQueryCellsForFeed('u09vw', 1) },
      { ...base, '#g': home },
    ])
  })
})

describe('feedRootEventMatchesQueryCells', () => {
  const cells = ['u09']

  it('matches kind 1 with hierarchical g prefix', () => {
    const evt: Event = {
      id: '1',
      pubkey: 'p',
      kind: 1,
      content: '',
      created_at: 1,
      tags: [
        ['g', 'u'],
        ['g', 'u09vw'],
      ],
      sig: 's',
    }
    expect(feedRootEventMatchesQueryCells(evt, cells)).toBe(true)
  })

  it('rejects replies', () => {
    const evt: Event = {
      id: '1',
      pubkey: 'p',
      kind: 1,
      content: '',
      created_at: 1,
      tags: [
        ['e', 'root'],
        ['g', 'u09'],
      ],
      sig: 's',
    }
    expect(feedRootEventMatchesQueryCells(evt, cells)).toBe(false)
  })

  it('matches valid NIP-52 with overlapping g', () => {
    const evt: Event = {
      id: '1',
      pubkey: 'p',
      kind: NIP52_KIND_DATE_EVENT,
      content: '',
      created_at: 1,
      tags: [
        ['d', 'x'],
        ['title', 'Hi'],
        ['start', '2020-01-01'],
        ['g', 'u09vw'],
      ],
      sig: 's',
    }
    expect(feedRootEventMatchesQueryCells(evt, cells)).toBe(true)
  })

  it('mode-0 cells match any geotagged root', () => {
    const global = getQueryCellsForFeed('u09vw', 0)
    const evt: Event = {
      id: '1',
      pubkey: 'p',
      kind: 1,
      content: '',
      created_at: 1,
      tags: [
        ['g', 'd'],
        ['g', 'dr5ru'],
      ],
      sig: 's',
    }
    expect(feedRootEventMatchesQueryCells(evt, global)).toBe(true)
  })
})

describe('filterFeedEventsByQuery', () => {
  it('returns empty when no query geohash', () => {
    expect(filterFeedEventsByQuery([], null, 0)).toEqual([])
  })

  it('keeps a root in a neighbor cell and drops one outside the 3×3', () => {
    const neighbor = note(['u', 'u2'])
    const outside = { ...note(['d', 'dr5ru']), id: '2' }
    expect(filterFeedEventsByQuery([neighbor, outside], 'u0xzz', 2)).toEqual([neighbor])
  })

  it('keeps followed authors even without a matching g tag', () => {
    const followedPk = 'f'.repeat(64)
    const followed = { ...note([]), id: 'f1', pubkey: followedPk }
    const outside = { ...note(['d', 'dr5ru']), id: '2', pubkey: 'x'.repeat(64) }
    expect(filterFeedEventsByQuery([followed, outside], 'u0xzz', 2, new Set([followedPk]))).toEqual(
      [followed],
    )
  })
})
