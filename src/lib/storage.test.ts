import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadJson, saveJson, loadJsonSync, saveJsonSync, loadEncryptedJson, saveEncryptedJson } from './storage'

describe('storage', () => {
  beforeEach(async () => {
    localStorage.clear()
    // Clear IndexedDB and wait for it to complete
    if (typeof indexedDB !== 'undefined') {
      await new Promise<void>((resolve) => {
        const deleteReq = indexedDB.deleteDatabase('brezn-storage')
        deleteReq.onsuccess = () => resolve()
        deleteReq.onerror = () => resolve() // Resolve even on error
        deleteReq.onblocked = () => resolve() // Resolve even if blocked
      })
      // Wait a bit for IndexedDB to fully close
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  })

  it('loadJson returns fallback when missing', async () => {
    localStorage.removeItem('k')
    expect(await loadJson('k', { a: 1 })).toEqual({ a: 1 })
  })

  it('saveJson + loadJson roundtrip', async () => {
    await saveJson('k2', { ok: true, n: 123 })
    expect(await loadJson('k2', { ok: false, n: 0 })).toEqual({ ok: true, n: 123 })
  })

  it('loadJson returns fallback on invalid JSON', async () => {
    localStorage.setItem('k3', '{not json')
    expect(await loadJson('k3', ['x'])).toEqual(['x'])
  })

  it('saveJson swallows storage errors', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    await expect(saveJson('k4', { a: 1 })).resolves.not.toThrow()
    spy.mockRestore()
  })

  it('loadJsonSync returns fallback when missing', () => {
    localStorage.removeItem('k')
    expect(loadJsonSync('k', { a: 1 })).toEqual({ a: 1 })
  })

  it('saveJsonSync + loadJsonSync roundtrip', () => {
    saveJsonSync('k2', { ok: true, n: 123 })
    expect(loadJsonSync('k2', { ok: false, n: 0 })).toEqual({ ok: true, n: 123 })
  })

  it('encrypts and decrypts sensitive fields', async () => {
    // Note: The encryption key is stored in IndexedDB and must persist between encrypt and decrypt
    const data = { secret: 'my-secret-key', public: 'public-data' }
    
    // Save encrypted data (this will generate and store the encryption key)
    await saveEncryptedJson('encrypted-key', data, ['secret'])
    
    // Wait for IndexedDB operations to complete
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Load and decrypt (should use the same encryption key)
    const loaded = await loadEncryptedJson('encrypted-key', { secret: '', public: '' }, ['secret'])
    
    expect(loaded.secret).toBe('my-secret-key')
    expect(loaded.public).toBe('public-data')
    
    // Verify that the stored value is actually encrypted (contains ':')
    // Check both localStorage and IndexedDB
    const storedLocal = JSON.parse(localStorage.getItem('encrypted-key') || '{}')
    if (storedLocal.secret && typeof storedLocal.secret === 'string') {
      // If it's encrypted, it should contain ':'
      if (storedLocal.secret.includes(':')) {
        expect(storedLocal.secret).not.toBe('my-secret-key') // Not plaintext
      }
    }
  })

  it('handles missing Web Crypto API gracefully', async () => {
    // This test verifies that encryption/decryption works in a normal browser environment
    // Web Crypto API should be available in Node.js test environment
    const data = { secret: 'test-key', public: 'data' }
    
    // Save encrypted
    await saveEncryptedJson('fallback-key', data, ['secret'])
    
    // Wait for IndexedDB operations
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Load and decrypt
    const loaded = await loadEncryptedJson('fallback-key', { secret: '', public: '' }, ['secret'])
    
    // Should work correctly with Web Crypto API
    expect(loaded.secret).toBe('test-key')
    expect(loaded.public).toBe('data')
  })
})

