import { describe, expect, it } from 'vitest'
import type { Event } from 'nostr-tools'
import {
  NIP52_KIND_TIME_EVENT,
  nip52CalendarMatchesQueryCells,
  nip52FeedCardPostContent,
  nip52ReplaceableMergeKey,
  nip52Title,
  upsertFeedEvents,
} from './nip52'

function baseEvt(over: Partial<Event>): Event {
  return {
    id: 'a'.repeat(64),
    pubkey: 'b'.repeat(64),
    created_at: 1_700_000_000,
    kind: NIP52_KIND_TIME_EVENT,
    tags: [],
    content: '',
    sig: 'c'.repeat(128),
    ...over,
  } as Event
}

describe('nip52ReplaceableMergeKey', () => {
  it('returns stable key for calendar events', () => {
    const evt = baseEvt({
      tags: [
        ['d', 'abc'],
        ['title', 'T'],
        ['start', '1700000000'],
      ],
    })
    expect(nip52ReplaceableMergeKey(evt)).toBe(`${NIP52_KIND_TIME_EVENT}:${'b'.repeat(64)}:abc`)
  })
  it('returns null without d', () => {
    const evt = baseEvt({
      tags: [
        ['title', 'T'],
        ['start', '1700000000'],
      ],
    })
    expect(nip52ReplaceableMergeKey(evt)).toBeNull()
  })
})

describe('nip52Title', () => {
  it('skips empty title tag and uses next non-empty title or name', () => {
    const evt = baseEvt({
      tags: [
        ['title', ''],
        ['title', 'Real'],
        ['d', 'x'],
        ['start', '1'],
      ],
    })
    expect(nip52Title(evt)).toBe('Real')
  })

  it('falls back to name when no non-empty title', () => {
    const evt = baseEvt({
      tags: [
        ['title', '  '],
        ['name', 'Named'],
        ['d', 'x'],
        ['start', '1'],
      ],
    })
    expect(nip52Title(evt)).toBe('Named')
  })
})

describe('nip52CalendarMatchesQueryCells', () => {
  it('matches geohash tag to cell', () => {
    const evt = baseEvt({
      tags: [
        ['d', 'x'],
        ['title', 'Meet'],
        ['start', '1700000000'],
        ['g', 'u4pru'],
      ],
    })
    expect(nip52CalendarMatchesQueryCells(evt, ['u4pr'])).toBe(true)
  })

  it('does not infer geohash from location free text', () => {
    const evt = baseEvt({
      tags: [
        ['d', 'x'],
        ['title', 'Meet'],
        ['start', '1700000000'],
        ['location', 'geo:12.345678,-45.987654'],
      ],
    })
    expect(nip52CalendarMatchesQueryCells(evt, ['u'])).toBe(false)
  })
})

describe('nip52FeedCardPostContent', () => {
  it('includes title, schedule line, and raw content', () => {
    const evt = baseEvt({
      content: 'calendar',
      tags: [
        ['d', 'x'],
        ['title', 'Picnic'],
        ['start', '1700000000'],
      ],
    })
    const out = nip52FeedCardPostContent(evt)
    expect(out).toContain('Picnic')
    expect(out).toContain('calendar')
    expect(out.length).toBeGreaterThan('Picnic'.length + 'calendar'.length)
  })

  it('joins summary and content under tags', () => {
    const evt = baseEvt({
      content: '#calendar\nDetails here',
      tags: [
        ['d', 'x'],
        ['title', 'T'],
        ['start', '1'],
        ['summary', 'Short'],
      ],
    })
    const out = nip52FeedCardPostContent(evt)
    expect(out).toContain('T')
    expect(out).toContain('Short')
    expect(out).toContain('Details here')
    expect(out).toContain('#calendar')
  })

  it('includes url tag when present', () => {
    const evt = baseEvt({
      tags: [
        ['d', 'x'],
        ['title', 'Meet'],
        ['start', '1700000000'],
        ['url', 'https://example.com/event'],
      ],
    })
    expect(nip52FeedCardPostContent(evt)).toContain('https://example.com/event')
  })
})

describe('upsertFeedEvents', () => {
  it('keeps newer replaceable revision', () => {
    const old = baseEvt({
      id: '1'.repeat(64),
      created_at: 100,
      tags: [
        ['d', 'same'],
        ['title', 'T'],
        ['start', '1'],
        ['g', 'u'],
      ],
    })
    const newer = baseEvt({
      id: '2'.repeat(64),
      created_at: 200,
      tags: [
        ['d', 'same'],
        ['title', 'T2'],
        ['start', '2'],
        ['g', 'u'],
      ],
    })
    const merged = upsertFeedEvents([old], newer)
    expect(merged).toHaveLength(1)
    expect(merged[0]!.id).toBe(newer.id)
  })
})
