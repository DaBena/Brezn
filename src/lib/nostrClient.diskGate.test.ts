import 'fake-indexeddb/auto'
import { bytesToHex } from '@noble/hashes/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BREZN_APP_STATE_LS_KEY } from './constants'
import { generateSecretKey, getPublicKey, nip19 } from './nostrPrimitives'

async function deleteBreznStorage(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  await new Promise<void>((resolve) => {
    const deleteReq = indexedDB.deleteDatabase('brezn-storage')
    deleteReq.onsuccess = () => resolve()
    deleteReq.onerror = () => resolve()
  })
}

describe('nostrClient disk persistence', () => {
  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    await deleteBreznStorage()
  })

  it('does not write brezn:v1 before consent; persists pubkey mirror after grant', async () => {
    const { syncBreznIndexedDbWriteConsentFromStorage } = await import('./storage')
    syncBreznIndexedDbWriteConsentFromStorage()

    const { createNostrClient, grantDiskPersistenceAndFlushState } = await import('./nostrClient')
    const client = createNostrClient()
    const { pubkey } = client.getPublicIdentity()
    expect(pubkey).toMatch(/^[0-9a-f]{64}$/i)
    expect(localStorage.getItem(BREZN_APP_STATE_LS_KEY)).toBeNull()

    grantDiskPersistenceAndFlushState(client)

    const raw = localStorage.getItem(BREZN_APP_STATE_LS_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!) as { pubkey?: string; skHex?: string }
    expect(parsed.pubkey).toBe(pubkey)
    expect(parsed.skHex).toBeUndefined()
  })

  it.skipIf(typeof indexedDB === 'undefined')(
    'migrates a legacy localStorage secret into IndexedDB before deleting it',
    async () => {
      const { grantBreznIndexedDbWrites } = await import('./storage')
      grantBreznIndexedDbWrites()
      const sk = generateSecretKey()
      const skHex = bytesToHex(sk)
      const pubkey = getPublicKey(sk)
      localStorage.setItem(
        BREZN_APP_STATE_LS_KEY,
        JSON.stringify({
          skHex,
          pubkey,
          npub: nip19.npubEncode(pubkey),
          mutedTerms: [],
          blockedPubkeys: [],
        }),
      )

      vi.resetModules()
      const { createNostrClient, whenIdentityStorageSettled } = await import('./nostrClient')
      await whenIdentityStorageSettled

      const raw = JSON.parse(localStorage.getItem(BREZN_APP_STATE_LS_KEY) || '{}') as {
        skHex?: string
        pubkey?: string
      }
      expect(raw.skHex).toBeUndefined()
      expect(raw.pubkey).toBe(pubkey)

      const client = createNostrClient()
      expect(client.getPublicIdentity().pubkey).toBe(pubkey)
      expect(client.getPrivateIdentity().skHex).toBe(skHex)
    },
  )

  it.skipIf(typeof indexedDB === 'undefined')(
    'keeps the IndexedDB secret when a relay save races storage init',
    async () => {
      const { grantBreznIndexedDbWrites, readIndexedDbValue } = await import('./storage')
      grantBreznIndexedDbWrites()
      vi.resetModules()
      const first = await import('./nostrClient')
      await first.whenIdentityStorageSettled
      const created = first.createNostrClient()
      const skHex = created.getPrivateIdentity().skHex
      const pubkey = created.getPublicIdentity().pubkey
      await vi.waitFor(async () => {
        const rec = await readIndexedDbValue<{ skHex?: string }>(BREZN_APP_STATE_LS_KEY)
        if (!rec.ok || !rec.value?.skHex) throw new Error('secret not in IndexedDB yet')
      })

      vi.resetModules()
      const second = await import('./nostrClient')
      const raced = second.createNostrClient()
      raced.getRelays()
      await second.whenIdentityStorageSettled
      expect(raced.getPublicIdentity().pubkey).toBe(pubkey)
      expect(raced.getPrivateIdentity().skHex).toBe(skHex)
    },
  )

  it('does not mint a key when password protection is set and the blob is missing', async () => {
    const { grantBreznIndexedDbWrites } = await import('./storage')
    grantBreznIndexedDbWrites()
    const pubkey = 'ab'.repeat(32)
    localStorage.setItem(
      BREZN_APP_STATE_LS_KEY,
      JSON.stringify({
        pubkey,
        npub: 'npub1example',
        skProtection: 'password',
        mutedTerms: [],
        blockedPubkeys: [],
      }),
    )

    vi.resetModules()
    const { createNostrClient, isIdentityVaultLocked, whenIdentityStorageSettled } =
      await import('./nostrClient')
    await whenIdentityStorageSettled
    expect(isIdentityVaultLocked()).toBe(false)
    const client = createNostrClient()
    expect(client.getPublicIdentity()).toEqual({ pubkey, npub: 'npub1example' })
    expect(() => client.getPrivateIdentity()).toThrow(/missing from storage/i)
  })

  it.skipIf(typeof indexedDB === 'undefined')(
    'unlocks a password blob that lives only in IndexedDB',
    async () => {
      const { grantBreznIndexedDbWrites, saveEncryptedJson } = await import('./storage')
      const { wrapSkWithPassword } = await import('./skVault')
      grantBreznIndexedDbWrites()
      const sk = generateSecretKey()
      const skHex = bytesToHex(sk)
      const pubkey = getPublicKey(sk)
      const npub = nip19.npubEncode(pubkey)
      const wrapped = await wrapSkWithPassword(skHex, 'correct-horse')
      await saveEncryptedJson(
        BREZN_APP_STATE_LS_KEY,
        {
          skHex: wrapped,
          pubkey,
          npub,
          skProtection: 'password',
          mutedTerms: [],
          blockedPubkeys: [],
        },
        ['skHex'],
      )
      const mirrored = JSON.parse(localStorage.getItem(BREZN_APP_STATE_LS_KEY) || '{}') as {
        skHex?: string
        skProtection?: string
      }
      expect(mirrored.skHex).toBeUndefined()
      expect(mirrored.skProtection).toBe('password')

      vi.resetModules()
      const {
        createNostrClient,
        isIdentityVaultLocked,
        lockIdentityVault,
        onIdentityVaultLocked,
        unlockIdentityVault,
        whenIdentityStorageSettled,
      } = await import('./nostrClient')
      await whenIdentityStorageSettled
      expect(isIdentityVaultLocked()).toBe(true)
      const client = createNostrClient()
      expect(client.getPublicIdentity().pubkey).toBe(pubkey)
      expect(() => client.getPrivateIdentity()).toThrow()
      await unlockIdentityVault('correct-horse')
      expect(isIdentityVaultLocked()).toBe(false)
      expect(client.getPrivateIdentity().skHex).toBe(skHex)

      let lockNotices = 0
      const stopLockNotice = onIdentityVaultLocked(() => {
        lockNotices += 1
      })
      expect(lockIdentityVault()).toBe(true)
      expect(lockNotices).toBe(1)
      stopLockNotice()
      expect(isIdentityVaultLocked()).toBe(true)
      expect(() => client.getPrivateIdentity()).toThrow()

      await unlockIdentityVault('correct-horse')
      expect(isIdentityVaultLocked()).toBe(false)
      expect(client.getPrivateIdentity().skHex).toBe(skHex)
    },
  )
})
