import { describe, expect, it } from 'vitest'
import type { Event } from 'nostr-tools'
import { mergeFeedIncoming } from './feedBatchMerge'
import { NIP52_KIND_DATE_EVENT } from './nip52'

function note(id: string, pubkey = 'ab'): Event {
  return {
    id,
    pubkey,
    kind: 1,
    content: 'x',
    created_at: 100,
    tags: [['g', 'u09']],
    sig: 's',
  }
}

describe('mergeFeedIncoming', () => {
  it('prepends new notes in batch order (each newest-first vs previous)', () => {
    const prev = [note('a')]
    const merged = mergeFeedIncoming(prev, [note('b'), note('c')])
    expect(merged.map((e) => e.id)).toEqual(['c', 'b', 'a'])
  })

  it('dedupes duplicate ids in batch and vs prev', () => {
    const n = note('x')
    expect(mergeFeedIncoming([], [n, n]).map((e) => e.id)).toEqual(['x'])
    expect(mergeFeedIncoming([n], [n]).map((e) => e.id)).toEqual(['x'])
  })

  it('skips reply notes', () => {
    const root = note('r')
    const reply: Event = { ...note('q'), tags: [['e', 'rootid']] }
    expect(mergeFeedIncoming([], [reply])).toEqual([])
    expect(mergeFeedIncoming([], [root, reply]).map((e) => e.id)).toEqual(['r'])
  })

  it('upserts NIP-52 replaceable by d tag', () => {
    const a: Event = {
      id: 'i1',
      pubkey: 'p',
      kind: NIP52_KIND_DATE_EVENT,
      content: '',
      created_at: 10,
      tags: [
        ['d', 'evt1'],
        ['title', 'T'],
        ['start', '2020-01-01'],
        ['g', 'u09'],
      ],
      sig: 's',
    }
    const b: Event = {
      ...a,
      id: 'i2',
      created_at: 20,
      tags: [
        ['d', 'evt1'],
        ['title', 'T2'],
        ['start', '2020-01-01'],
        ['g', 'u09'],
      ],
    }
    const merged = mergeFeedIncoming([a], [b])
    expect(merged).toHaveLength(1)
    expect(merged[0]!.id).toBe('i2')
  })
})
