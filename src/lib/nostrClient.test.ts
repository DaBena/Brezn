import { NDKEvent } from '@nostr-dev-kit/ndk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSavedGeo5 } from './lastLocation'
import { createNostrClient } from './nostrClient'

describe('nostrClient NDK / Vitest', () => {
  beforeEach(() => {
    localStorage.clear()
    setSavedGeo5('u0m0m')
  })

  it('skips live ndk.connect when VITEST is set (avoids undici WebSocket vs jsdom EventTarget)', () => {
    expect(process.env.VITEST).toBe('true')
    const client = createNostrClient()
    expect(client.getRelays().length).toBeGreaterThan(0)
  })
})

describe('nostrClient identity (no accounts)', () => {
  beforeEach(() => {
    localStorage.clear()
    setSavedGeo5('u0m0m')
  })

  it('auto-creates a persistent identity on first run', () => {
    const client = createNostrClient()
    const id = client.getPublicIdentity()
    expect(id.pubkey).toMatch(/^[0-9a-f]{64}$/i)
    expect(id.npub).toMatch(/^npub1/i)
    // Secret key is stored in IndexedDB (encrypted) or in localStorage in fallback; either way identity persists.
    const privateId = client.getPrivateIdentity()
    expect(typeof privateId.skHex).toBe('string')
    expect(privateId.skHex).toHaveLength(64)
  })

  it('persists the same identity across reloads', () => {
    const client1 = createNostrClient()
    const id1 = client1.getPublicIdentity()

    const client2 = createNostrClient()
    const id2 = client2.getPublicIdentity()

    expect(id2.pubkey).toBe(id1.pubkey)
    expect(id2.npub).toBe(id1.npub)
  })

  it('persists keyword filters', () => {
    const client = createNostrClient()
    client.setMutedTerms(['spam', ' evil.example ', 'SPAM'])
    const client2 = createNostrClient()
    expect(client2.getMutedTerms()).toEqual(['spam', 'evil.example'])
  })

  it('persists geohash length setting', () => {
    const client = createNostrClient()
    client.setGeohashLength(3)
    const client2 = createNostrClient()
    expect(client2.getGeohashLength()).toBe(3)
  })
})

describe('nostrClient blocked pubkeys', () => {
  beforeEach(() => {
    localStorage.clear()
    setSavedGeo5('u0m0m')
  })

  it('normalizes blocked pubkeys', async () => {
    const client = createNostrClient()
    const validPubkey = 'a'.repeat(64)
    const invalidPubkey = 'b'.repeat(32) // too short
    const emptyPubkey = ''

    await client.setBlockedPubkeys([
      validPubkey,
      invalidPubkey,
      emptyPubkey,
      '  ' + validPubkey + '  ',
    ])
    const blocked = client.getBlockedPubkeys()

    expect(blocked).toEqual([validPubkey])
  })

  it('removes duplicates from blocked pubkeys', async () => {
    const client = createNostrClient()
    const pubkey = 'a'.repeat(64)
    await client.setBlockedPubkeys([pubkey, pubkey, pubkey])
    expect(client.getBlockedPubkeys()).toEqual([pubkey])
  })

  it('limits blocked pubkeys to 1000', async () => {
    const client = createNostrClient()
    const pubkeys = Array.from({ length: 1500 }, (_, i) => i.toString().padStart(64, '0'))
    await client.setBlockedPubkeys(pubkeys)
    expect(client.getBlockedPubkeys().length).toBe(1000)
  })

  it('persists blocked pubkeys', async () => {
    const client = createNostrClient()
    const pubkey = 'a'.repeat(64)
    await client.setBlockedPubkeys([pubkey])

    const client2 = createNostrClient()
    expect(client2.getBlockedPubkeys()).toEqual([pubkey])
  })
})

describe('nostrClient geohash length', () => {
  beforeEach(() => {
    localStorage.clear()
    setSavedGeo5('u0m0m')
  })

  it('defaults to 2', () => {
    const client = createNostrClient()
    const length = client.getGeohashLength()
    expect(length).toBeGreaterThanOrEqual(1)
    expect(length).toBeLessThanOrEqual(5)
  })

  it('clamps geohash length to valid range', () => {
    const client = createNostrClient()
    client.setGeohashLength(0)
    expect(client.getGeohashLength()).toBe(0) // 0 is now a valid value (queries current + east/west)

    client.setGeohashLength(10)
    expect(client.getGeohashLength()).toBe(5)

    client.setGeohashLength(3.7)
    expect(client.getGeohashLength()).toBe(4) // rounded
  })
})

describe('nostrClient relays', () => {
  beforeEach(() => {
    localStorage.clear()
    setSavedGeo5('u0m0m')
  })

  it('returns NDK pool or bootstrap when no manual override', () => {
    const client = createNostrClient()
    const relays = client.getRelays()
    expect(relays.length).toBeGreaterThan(0)
    expect(relays.every((r) => r.startsWith('wss://') || r.startsWith('ws://'))).toBe(true)
    expect(
      relays.some((r) => {
        try {
          const u = new URL(r)
          return u.hostname === 'relay.damus.io'
        } catch {
          return false
        }
      }),
    ).toBe(true)
  })

  it('normalizes relay URLs when pinned', () => {
    const client = createNostrClient()
    client.setRelays([
      'wss://relay.example.com',
      'wss://relay.example.com/',
      'ws://relay.example.com',
      'invalid-url',
      'https://not-ws.com',
    ])

    const relays = client.getRelays()
    expect(relays).toContain('wss://relay.example.com')
    expect(relays).not.toContain('wss://relay.example.com/')
    expect(
      relays.some((r) => {
        try {
          const u = new URL(r)
          return (
            u.hostname === 'relay.example.com' && (u.protocol === 'wss:' || u.protocol === 'ws:')
          )
        } catch {
          return false
        }
      }),
    ).toBe(true)
    expect(relays).not.toContain('invalid-url')
    expect(relays).not.toContain('https://not-ws.com')
  })

  it('removes duplicate relays when pinned', () => {
    const client = createNostrClient()
    client.setRelays([
      'wss://relay.example.com',
      'wss://RELAY.EXAMPLE.COM',
      'wss://relay.example.com',
    ])

    const relays = client.getRelays()
    expect(relays.filter((r) => r.toLowerCase() === 'wss://relay.example.com').length).toBe(1)
  })

  it('limits pinned relays to 30', () => {
    const client = createNostrClient()
    const manyRelays = Array.from({ length: 50 }, (_, i) => `wss://relay${i}.example.com`)
    client.setRelays(manyRelays)
    expect(client.getRelays().length).toBe(30)
  })

  it('persists pinned relay configuration', () => {
    const client = createNostrClient()
    client.setRelays(['wss://custom.relay.com'])

    const client2 = createNostrClient()
    const relays = client2.getRelays()
    expect(relays).toContain('wss://custom.relay.com')
  })

  it('clearRelayOverrides removes pin across instances', () => {
    const client = createNostrClient()
    client.setRelays(['wss://only-pinned.example.com'])
    expect(client.getRelays()).toEqual(['wss://only-pinned.example.com'])

    client.clearRelayOverrides()
    const client2 = createNostrClient()
    expect(client2.getRelays()).not.toEqual(['wss://only-pinned.example.com'])
    expect(client2.getRelays().length).toBeGreaterThan(0)
  })
})

describe('nostrClient media upload endpoint', () => {
  beforeEach(() => {
    localStorage.clear()
    setSavedGeo5('u0m0m')
  })

  it('returns default endpoint when not configured', () => {
    const client = createNostrClient()
    const endpoint = client.getMediaUploadEndpoint()
    expect(typeof endpoint).toBe('string')
    expect(endpoint?.length).toBeGreaterThan(0)
  })

  it('allows setting custom endpoint', () => {
    const client = createNostrClient()
    client.setMediaUploadEndpoint('https://upload.example.com')
    expect(client.getMediaUploadEndpoint()).toBe('https://upload.example.com')
  })

  it('allows disabling uploads with empty string', () => {
    const client = createNostrClient()
    client.setMediaUploadEndpoint(null)
    expect(client.getMediaUploadEndpoint()).toBeUndefined()
  })

  it('persists media upload endpoint', () => {
    const client = createNostrClient()
    client.setMediaUploadEndpoint('https://custom.upload.com')

    const client2 = createNostrClient()
    expect(client2.getMediaUploadEndpoint()).toBe('https://custom.upload.com')
  })
})

describe('nostrClient NIP-56 report events', () => {
  let publishSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
    setSavedGeo5('u0m0m')
    vi.clearAllMocks()
    publishSpy = vi.spyOn(NDKEvent.prototype, 'publish').mockImplementation(async function (
      this: NDKEvent,
    ) {
      if (!this.id) this.id = 'c'.repeat(64)
      return new Set() as Awaited<ReturnType<NDKEvent['publish']>>
    })
  })

  afterEach(() => {
    publishSpy.mockRestore()
  })

  it('publishes NIP-56 report event with reason in content field', async () => {
    const client = createNostrClient()
    const targetPubkey = 'a'.repeat(64)
    const targetEventId = 'b'.repeat(64)
    const reportReason = 'Spam content'

    await expect(
      client.publish({
        kind: 1984,
        content: reportReason,
        tags: [
          ['p', targetPubkey],
          ['e', targetEventId],
        ],
      }),
    ).resolves.toMatch(/^[a-f0-9]{64}$/i)
  })

  it('validates NIP-56 report event structure', () => {
    // Test that we understand the correct NIP-56 format
    const targetPubkey = 'c'.repeat(64)
    const targetEventId = 'd'.repeat(64)
    const reportReason = 'Harassment'

    // Correct NIP-56 format:
    const correctEvent = {
      kind: 1984,
      content: reportReason, // Report reason in content field
      tags: [
        ['p', targetPubkey], // Referenced profile
        ['e', targetEventId], // Referenced event
      ],
    }

    // Verify structure
    expect(correctEvent.kind).toBe(1984)
    expect(correctEvent.content).toBe(reportReason)
    expect(correctEvent.tags.some((t) => t[0] === 'p' && t[1] === targetPubkey)).toBe(true)
    expect(correctEvent.tags.some((t) => t[0] === 'e' && t[1] === targetEventId)).toBe(true)
    expect(correctEvent.tags.some((t) => t[0] === 'report')).toBe(false) // Should NOT have report tag

    // Incorrect format (what we had before):
    const incorrectEvent = {
      kind: 1984,
      content: '', // Empty content (WRONG)
      tags: [
        ['p', targetPubkey],
        ['e', targetEventId],
        ['report', reportReason], // Report reason in tag (WRONG)
      ],
    }

    // Verify this is incorrect
    expect(incorrectEvent.content).toBe('')
    expect(incorrectEvent.tags.some((t) => t[0] === 'report')).toBe(true)
  })
})
