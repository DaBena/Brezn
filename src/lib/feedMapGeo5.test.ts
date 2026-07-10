import { describe, expect, it } from 'vitest'
import { geo5FromEvent, postGeo5FromFeed } from './feedMapGeo5'
import type { Event } from './nostrPrimitives'

function note(gTags: string[]): Event {
  return {
    id: 'id',
    pubkey: 'aa'.repeat(32),
    created_at: 1,
    kind: 1,
    tags: gTags.map((g) => ['g', g]),
    content: '',
    sig: 'bb'.repeat(64),
  }
}

describe('feedMapGeo5', () => {
  it('geo5FromEvent requires 5-char g tag', () => {
    expect(geo5FromEvent(note(['u', 'u0m', 'u0m1x']))).toBe('u0m1x')
    expect(geo5FromEvent(note(['u0m']))).toBeNull()
  })

  it('postGeo5FromFeed deduplicates and skips viewer cell', () => {
    expect(
      postGeo5FromFeed(
        [note(['u0m1x']), note(['u0m1x']), note(['u0m1y'])],
        'u0m1x',
      ),
    ).toEqual(['u0m1y'])
  })
})
