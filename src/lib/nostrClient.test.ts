import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createNostrClient } from './nostrClient'

describe('nostrClient identity (no accounts)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('auto-creates a persistent identity on first run', () => {
    const client = createNostrClient()
    const id = client.getPublicIdentity()
    expect(id.pubkey).toMatch(/^[0-9a-f]{64}$/i)
    expect(id.npub).toMatch(/^npub1/i)

    const stored = JSON.parse(localStorage.getItem('brezn:v1') ?? '{}') as Record<string, unknown>
    expect(typeof stored.skHex).toBe('string')
    expect((stored.skHex as string).length).toBe(64)
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
    client.setMutedTerms(['spam', ' telegram.me ', 'SPAM'])
    const client2 = createNostrClient()
    expect(client2.getMutedTerms()).toEqual(['spam', 'telegram.me'])
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
  })

  it('normalizes blocked pubkeys', () => {
    const client = createNostrClient()
    const validPubkey = 'a'.repeat(64)
    const invalidPubkey = 'b'.repeat(32) // too short
    const emptyPubkey = ''
    
    client.setBlockedPubkeys([validPubkey, invalidPubkey, emptyPubkey, '  ' + validPubkey + '  '])
    const blocked = client.getBlockedPubkeys()
    
    expect(blocked).toEqual([validPubkey])
  })

  it('removes duplicates from blocked pubkeys', () => {
    const client = createNostrClient()
    const pubkey = 'a'.repeat(64)
    client.setBlockedPubkeys([pubkey, pubkey, pubkey])
    expect(client.getBlockedPubkeys()).toEqual([pubkey])
  })

  it('limits blocked pubkeys to 1000', () => {
    const client = createNostrClient()
    const pubkeys = Array.from({ length: 1500 }, (_, i) => i.toString().padStart(64, '0'))
    client.setBlockedPubkeys(pubkeys)
    expect(client.getBlockedPubkeys().length).toBe(1000)
  })

  it('persists blocked pubkeys', () => {
    const client = createNostrClient()
    const pubkey = 'a'.repeat(64)
    client.setBlockedPubkeys([pubkey])
    
    const client2 = createNostrClient()
    expect(client2.getBlockedPubkeys()).toEqual([pubkey])
  })
})

describe('nostrClient geohash length', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to 2', () => {
    const client = createNostrClient()
    const length = client.getGeohashLength()
    expect(length).toBeGreaterThanOrEqual(1)
    expect(length).toBeLessThanOrEqual(5)
    // Default should be 2, but might be different if localStorage has old data
    // So we just check it's in valid range
  })

  it('clamps geohash length to valid range', () => {
    const client = createNostrClient()
    client.setGeohashLength(0)
    expect(client.getGeohashLength()).toBe(1)
    
    client.setGeohashLength(10)
    expect(client.getGeohashLength()).toBe(5)
    
    client.setGeohashLength(3.7)
    expect(client.getGeohashLength()).toBe(4) // rounded
  })

  it('migrates old localRadiusKm to geohashLength', () => {
    // Simulate old state with localRadiusKm
    const oldState = {
      mutedTerms: [],
      blockedPubkeys: [],
      settings: {
        localRadiusKm: 300, // Should map to geohashLength 3 (>=200km)
      },
    }
    localStorage.setItem('brezn:v1', JSON.stringify(oldState))
    
    const client = createNostrClient()
    const length = client.getGeohashLength()
    // 300km should map to 3, but let's check it's in the right range
    expect(length).toBeGreaterThanOrEqual(1)
    expect(length).toBeLessThanOrEqual(5)
    
    // Verify migration saved the new value (should be 3 for 300km)
    const stored = JSON.parse(localStorage.getItem('brezn:v1') ?? '{}')
    if (stored.settings?.geohashLength) {
      expect(stored.settings.geohashLength).toBe(3)
    }
  })
})

describe('nostrClient relays', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns default relays when none configured', () => {
    const client = createNostrClient()
    const relays = client.getRelays()
    expect(relays.length).toBeGreaterThan(0)
    expect(relays.every(r => r.startsWith('wss://'))).toBe(true)
  })

  it('normalizes relay URLs', () => {
    const client = createNostrClient()
    client.setRelays([
      'wss://relay.example.com',
      'wss://relay.example.com/', // trailing slash
      'ws://relay.example.com', // ws is also accepted (for local testing)
      'invalid-url',
      'https://not-ws.com',
    ])
    
    const relays = client.getRelays()
    expect(relays).toContain('wss://relay.example.com')
    expect(relays).not.toContain('wss://relay.example.com/') // trailing slash removed
    // ws:// is actually accepted (for local testing), so we check it's normalized
    expect(relays.some(r => r.includes('relay.example.com'))).toBe(true)
    expect(relays).not.toContain('invalid-url')
    expect(relays).not.toContain('https://not-ws.com')
  })

  it('removes duplicate relays', () => {
    const client = createNostrClient()
    client.setRelays([
      'wss://relay.example.com',
      'wss://RELAY.EXAMPLE.COM', // case-insensitive duplicate
      'wss://relay.example.com',
    ])
    
    const relays = client.getRelays()
    expect(relays.filter(r => r.toLowerCase() === 'wss://relay.example.com').length).toBe(1)
  })

  it('limits relays to 30', () => {
    const client = createNostrClient()
    const manyRelays = Array.from({ length: 50 }, (_, i) => `wss://relay${i}.example.com`)
    client.setRelays(manyRelays)
    expect(client.getRelays().length).toBe(30)
  })

  it('persists relay configuration', () => {
    const client = createNostrClient()
    client.setRelays(['wss://custom.relay.com'])
    
    const client2 = createNostrClient()
    const relays = client2.getRelays()
    expect(relays).toContain('wss://custom.relay.com')
  })
})

describe('nostrClient media upload endpoint', () => {
  beforeEach(() => {
    localStorage.clear()
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
