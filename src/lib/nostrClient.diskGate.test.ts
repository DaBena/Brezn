import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('nostrClient disk persistence', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  it('does not write brezn:v1 before consent; persists pubkey mirror after grant', async () => {
    const { syncBreznIndexedDbWriteConsentFromStorage } = await import('./storage')
    syncBreznIndexedDbWriteConsentFromStorage()

    const { createNostrClient, grantDiskPersistenceAndFlushState } = await import('./nostrClient')
    const client = createNostrClient()
    const { pubkey } = client.getPublicIdentity()
    expect(pubkey).toMatch(/^[0-9a-f]{64}$/i)
    expect(localStorage.getItem('brezn:v1')).toBeNull()

    grantDiskPersistenceAndFlushState(client)

    const raw = localStorage.getItem('brezn:v1')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).pubkey).toBe(pubkey)
  })
})
