import { describe, expect, it } from 'vitest'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import { ndkEventToBreznEvent } from './ndkEventUtils'

describe('ndkEventToBreznEvent', () => {
  it('returns a wire Event shape from NDKEvent.rawEvent()', () => {
    const raw = {
      id: 'a'.repeat(64),
      pubkey: 'b'.repeat(64),
      created_at: 1700000000,
      kind: 1,
      tags: [['g', 'u0']] as string[][],
      content: 'hello',
      sig: 'c'.repeat(128),
    }
    const e = new NDKEvent(undefined, raw)
    const out = ndkEventToBreznEvent(e)
    expect(out.id).toBe(raw.id)
    expect(out.pubkey).toBe(raw.pubkey)
    expect(out.kind).toBe(1)
    expect(out.content).toBe('hello')
    expect(out.tags).toEqual(raw.tags)
    expect(out.sig).toBe(raw.sig)
    expect(out.created_at).toBe(1700000000)
  })
})
