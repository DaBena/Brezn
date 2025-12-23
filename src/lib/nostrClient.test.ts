import { beforeEach, describe, expect, it } from 'vitest'
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

  it('persists local radius setting', () => {
    const client = createNostrClient()
    client.setLocalRadiusKm(123)
    const client2 = createNostrClient()
    expect(client2.getLocalRadiusKm()).toBe(123)
  })
})

