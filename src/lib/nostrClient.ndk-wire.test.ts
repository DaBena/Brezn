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
    const onevent = vi.fn()
    const unsub = client.subscribe({ kinds: [1], limit: 5 }, { onevent, immediate: true })
    expect(subscribeSpy).toHaveBeenCalled()
    const [, opts] = subscribeSpy.mock.calls[0]!
    expect(opts).toMatchObject({ groupable: false })
    expect(subscribeSpy.mock.calls[0]![0]).toEqual({ kinds: [1], limit: 5 })
    unsub()
  })

  it('publish signs and calls NDKEvent.publish', async () => {
    const client = createNostrClient()
    await expect(client.publish({ kind: 1, content: 'ndk-wire-test', tags: [] })).resolves.toMatch(
      /^[a-f0-9]{64}$/i,
    )
    expect(publishSpy).toHaveBeenCalled()
  })
})
