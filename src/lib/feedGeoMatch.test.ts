import { describe, expect, it } from 'vitest'
import type { Event } from './nostrPrimitives'
import {
  feedRootEventMatchesQueryCells,
  filterFeedEventsByQuery,
  getQueryCellsForFeed,
  gCellsCoarsePlusFine,
} from './feedGeoMatch'
import { NIP52_KIND_DATE_EVENT } from './nip52'

describe('getQueryCellsForFeed', () => {
  it('uses coarse band for precision 0 and 5-char hash', () => {
    const cells = getQueryCellsForFeed('u09vw', 0)
    expect(cells).toEqual(gCellsCoarsePlusFine('u09vw'))
    expect(cells.length).toBeGreaterThanOrEqual(1)
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
})

describe('filterFeedEventsByQuery', () => {
  it('returns empty when no query geohash', () => {
    expect(filterFeedEventsByQuery([], null, 0)).toEqual([])
  })
})
