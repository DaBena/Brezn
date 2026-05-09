import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NDK from '@nostr-dev-kit/ndk'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import { setSavedGeo5 } from './lastLocation'
import { createNostrClient } from './nostrClient'

describe('nostrClient NDK call shape (spies)', () => {
  let subscribeSpy: ReturnType<typeof vi.spyOn>
  let publishSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
    setSavedGeo5('u0m0m')
    subscribeSpy = vi.spyOn(NDK.prototype, 'subscribe').mockReturnValue({
      stop: vi.fn(),
    } as ReturnType<NDK['subscribe']>)
    publishSpy = vi.spyOn(NDKEvent.prototype, 'publish').mockImplementation(async function (
      this: NDKEvent,
    ) {
      if (!this.id) this.id = 'f'.repeat(64)
      return new Set() as Awaited<ReturnType<NDKEvent['publish']>>
    })
  })

  afterEach(() => {
    subscribeSpy.mockRestore()
    publishSpy.mockRestore()
  })

  it('subscribe passes filter and groupable:false to NDK', () => {
    const client = createNostrClient()
    const expectedRelays = client.getRelays()
    const onevent = vi.fn()
    const unsub = client.subscribe({ kinds: [1], limit: 5 }, { onevent, immediate: true })
    expect(subscribeSpy).toHaveBeenCalled()
    const [, opts] = subscribeSpy.mock.calls[0]!
    expect(opts).toMatchObject({ groupable: false, relayUrls: expectedRelays })
    expect(subscribeSpy.mock.calls[0]![0]).toEqual({ kinds: [1], limit: 5 })
    unsub()
  })

  it('publish signs and calls NDKEvent.publish', async () => {
    const client = createNostrClient()
    await expect(client.publish({ kind: 1, content: 'ndk-wire-test', tags: [] })).resolves.toMatch(
      /^[a-f0-9]{64}$/i,
    )
    expect(publishSpy).toHaveBeenCalled()
    expect(publishSpy.mock.calls[0]![0]).toBeDefined()
  })

  it('subscribe pins relayUrls to getRelays() after setRelays (no extra relays)', () => {
    const client = createNostrClient()
    client.setRelays(['wss://relay-a.example', 'wss://relay-b.example'])
    const expected = client.getRelays()
    expect(expected.length).toBe(2)

    subscribeSpy.mockClear()
    client.subscribe({ kinds: [1], limit: 3 }, { onevent: vi.fn(), immediate: true })

    expect(subscribeSpy).toHaveBeenCalledTimes(1)
    const [, opts] = subscribeSpy.mock.calls[0]!
    expect(opts?.relayUrls).toEqual(expected)
  })

  it('subscribeGrouped passes the same relayUrls as getRelays()', () => {
    const client = createNostrClient()
    client.setRelays(['wss://grouped-only.example'])
    const expected = client.getRelays()

    subscribeSpy.mockClear()
    client.subscribeGrouped([{ kinds: [1], limit: 5 }], { onevent: vi.fn() }, 'test-group')

    expect(subscribeSpy).toHaveBeenCalledTimes(1)
    const [, opts] = subscribeSpy.mock.calls[0]!
    expect(opts?.relayUrls).toEqual(expected)
  })

  it('publish passes an NDKRelaySet whose URLs match getRelays() only', async () => {
    const client = createNostrClient()
    client.setRelays(['wss://publish-target.example'])
    const expected = client.getRelays()

    publishSpy.mockClear()
    await client.publish({ kind: 1, content: 'relay-set-test', tags: [] })

    expect(publishSpy).toHaveBeenCalledTimes(1)
    const relaySet = publishSpy.mock.calls[0]![0] as { relayUrls: string[] }
    expect(relaySet).toBeDefined()
    expect(Array.isArray(relaySet.relayUrls)).toBe(true)
    const stripTrail = (u: string) => (u.endsWith('/') ? u.slice(0, -1) : u)
    expect(relaySet.relayUrls.map(stripTrail)).toEqual(expected.map(stripTrail))
  })
})
