import { describe, expect, test, vi } from 'vitest'
import type { Event } from './nostrPrimitives'
import type { BreznNostrClient } from './nostrClient'
import { resolveEventById } from './eventResolver'

function makeEvent(id: string): Event {
  return {
    id,
    pubkey: 'b'.repeat(64),
    created_at: 1,
    kind: 1,
    tags: [],
    content: 'hello',
    sig: 'c'.repeat(128),
  }
}

describe('resolveEventById', () => {
  test('resolves event via subscribe ids filter', async () => {
    const eventId = 'a'.repeat(64)
    const event = makeEvent(eventId)
    const subscribe = vi.fn((filter, opts) => {
      expect(filter.ids).toEqual([eventId])
      opts.onevent(event)
      opts.oneose?.()
      return () => {}
    })
    const client = { subscribe } as unknown as BreznNostrClient
    const result = await resolveEventById(client, eventId)
    expect(result?.id).toBe(eventId)
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  test('uses cache for repeated lookups', async () => {
    const eventId = 'd'.repeat(64)
    const event = makeEvent(eventId)
    const subscribe = vi.fn((_, opts) => {
      opts.onevent(event)
      return () => {}
    })
    const client = { subscribe } as unknown as BreznNostrClient

    const r1 = await resolveEventById(client, eventId)
    const r2 = await resolveEventById(client, eventId)

    expect(r1?.id).toBe(eventId)
    expect(r2?.id).toBe(eventId)
    expect(subscribe).toHaveBeenCalledTimes(1)
  })
})
