import { describe, expect, it } from 'vitest'
import type { Event } from './nostrPrimitives'
import {
  feedRootEventMatchesQueryCells,
  filterFeedEventsByQuery,
  getQueryCellsForFeed,
} from './feedGeoMatch'
import { GEOHASH_BASE32_PREFIXES } from './geo'
import { NIP52_KIND_DATE_EVENT } from './nip52'

describe('getQueryCellsForFeed', () => {
  it('uses all 32 base32 prefixes for precision 0', () => {
    const cells = getQueryCellsForFeed('u09vw', 0)
    expect(cells).toEqual([...GEOHASH_BASE32_PREFIXES])
    expect(cells).toHaveLength(32)
  })

  it('uses single prefix cell otherwise', () => {
    expect(getQueryCellsForFeed('u09', 3)).toEqual(['u09'])
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
})
