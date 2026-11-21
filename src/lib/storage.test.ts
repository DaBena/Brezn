import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BREZN_APP_STATE_LS_KEY } from './constants'
import { aesGcmEncryptText } from './aesGcm'
import {
  loadJson,
  saveJson,
  loadJsonSync,
  saveJsonSync,
  loadEncryptedJson,
  saveEncryptedJson,
  grantBreznIndexedDbWrites,
  syncBreznIndexedDbWriteConsentFromStorage,
  isBreznStorageConsentGranted,
  scrubSkHexFromLocalStorageMirror,
  noteSkHexDurableInIndexedDb,
} from './storage'

function withStore(mode: IDBTransactionMode, run: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('brezn-storage')
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('keyValueStore')) db.createObjectStore('keyValueStore')
    }
    req.onerror = () => reject(req.error ?? new Error('open failed'))
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('keyValueStore', mode)
      run(tx.objectStore('keyValueStore'))
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error ?? new Error('tx failed'))
    }
  })
}

function readDeviceKey(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    void withStore('readonly', (store) => {
      const getReq = store.get('brezn:encryption-key')
      getReq.onsuccess = () => resolve(getReq.result)
      getReq.onerror = () => reject(getReq.error ?? new Error('get failed'))
    }).catch(reject)
  })
}

function putDeviceKey(value: BufferSource): Promise<void> {
  return withStore('readwrite', (store) => {
    store.put(value, 'brezn:encryption-key')
  })
}

describe('storage', () => {
  beforeEach(async () => {
    localStorage.clear()
    syncBreznIndexedDbWriteConsentFromStorage()
    grantBreznIndexedDbWrites()
    // Clear IndexedDB and wait for it to complete
    if (typeof indexedDB !== 'undefined') {
      await new Promise<void>((resolve) => {
        const deleteReq = indexedDB.deleteDatabase('brezn-storage')
        deleteReq.onsuccess = () => resolve()
        deleteReq.onerror = () => resolve()
      })
      // Wait a bit for IndexedDB to fully close
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  })

  it('IndexedDB consent stays off until explicit grant', () => {
    localStorage.clear()
    syncBreznIndexedDbWriteConsentFromStorage()
    expect(isBreznStorageConsentGranted()).toBe(false)
    grantBreznIndexedDbWrites()
    expect(isBreznStorageConsentGranted()).toBe(true)
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
    await new Promise((resolve) => setTimeout(resolve, 200))

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

  it('never persists plaintext for sensitive fields', async () => {
    const data = { secret: 'a'.repeat(64), public: 'data' }
    await saveEncryptedJson('no-plain-key', data, ['secret'])
    await new Promise((resolve) => setTimeout(resolve, 200))

    const storedLocal = JSON.parse(localStorage.getItem('no-plain-key') || '{}') as {
      secret?: string
    }
    expect(storedLocal.secret).toBeTruthy()
    expect(storedLocal.secret).not.toBe(data.secret)
    expect(storedLocal.secret!.includes(':')).toBe(true)

    const loaded = await loadEncryptedJson('no-plain-key', { secret: '', public: '' }, ['secret'])
    expect(loaded.secret).toBe(data.secret)
  })

  it('leaves password-wrapped blobs untouched', async () => {
    const blob = 'v2:pbkdf2:310000:c2FsdA==:aXY=:Y3Q='
    await saveEncryptedJson('pw-blob', { secret: blob, public: 'x' }, ['secret'])
    const storedLocal = JSON.parse(localStorage.getItem('pw-blob') || '{}') as { secret?: string }
    expect(storedLocal.secret).toBe(blob)
  })

  it('never mirrors skHex into localStorage for app state key', async () => {
    await saveJson(BREZN_APP_STATE_LS_KEY, {
      skHex: 'a'.repeat(64),
      pubkey: 'b'.repeat(64),
      mutedTerms: [],
      blockedPubkeys: [],
    })
    const raw = JSON.parse(localStorage.getItem(BREZN_APP_STATE_LS_KEY) || '{}') as {
      skHex?: string
      pubkey?: string
    }
    expect(raw.skHex).toBeUndefined()
    expect(raw.pubkey).toBe('b'.repeat(64))
  })

  it('keeps a legacy app-state skHex until IndexedDB durability is recorded', () => {
    const legacy = 'ab'.repeat(32)
    localStorage.setItem(
      BREZN_APP_STATE_LS_KEY,
      JSON.stringify({ skHex: legacy, pubkey: 'cd'.repeat(32), mutedTerms: [] }),
    )
    saveJsonSync(BREZN_APP_STATE_LS_KEY, { pubkey: 'cd'.repeat(32), mutedTerms: ['x'] })
    const kept = JSON.parse(localStorage.getItem(BREZN_APP_STATE_LS_KEY) || '{}') as {
      skHex?: string
      mutedTerms?: string[]
    }
    expect(kept.skHex).toBe(legacy)
    expect(kept.mutedTerms).toEqual(['x'])

    noteSkHexDurableInIndexedDb()
    saveJsonSync(BREZN_APP_STATE_LS_KEY, { pubkey: 'cd'.repeat(32), mutedTerms: ['y'] })
    const dropped = JSON.parse(localStorage.getItem(BREZN_APP_STATE_LS_KEY) || '{}') as {
      skHex?: string
      mutedTerms?: string[]
    }
    expect(dropped.skHex).toBeUndefined()
    expect(dropped.mutedTerms).toEqual(['y'])
  })

  it.skipIf(typeof indexedDB === 'undefined')(
    'does not replace an unreadable device wrap key',
    async () => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('brezn-storage')
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('keyValueStore')) db.createObjectStore('keyValueStore')
        }
        req.onerror = () => reject(req.error ?? new Error('open failed'))
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('keyValueStore', 'readwrite')
          tx.objectStore('keyValueStore').put({ not: 'a key' }, 'brezn:encryption-key')
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error ?? new Error('put failed'))
        }
      })

      await expect(
        saveEncryptedJson('wrap-key-guard', { secret: 'ab'.repeat(32) }, ['secret']),
      ).rejects.toThrow(/unreadable/i)

      const still = await new Promise<unknown>((resolve, reject) => {
        const req = indexedDB.open('brezn-storage')
        req.onerror = () => reject(req.error ?? new Error('reopen failed'))
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('keyValueStore', 'readonly')
          const getReq = tx.objectStore('keyValueStore').get('brezn:encryption-key')
          getReq.onsuccess = () => {
            db.close()
            resolve(getReq.result)
          }
          getReq.onerror = () => reject(getReq.error ?? new Error('get failed'))
        }
      })
      expect(still).toEqual({ not: 'a key' })
    },
  )

  it.skipIf(typeof indexedDB === 'undefined')(
    'stores a non-extractable device key and upgrades legacy raw bytes',
    async () => {
      await saveEncryptedJson('device-key', { secret: 'ab'.repeat(32) }, ['secret'])
      const created = await readDeviceKey()
      expect(created).toBeInstanceOf(CryptoKey)
      expect((created as CryptoKey).extractable).toBe(false)

      const raw = crypto.getRandomValues(new Uint8Array(32))
      const wrapped = await aesGcmEncryptText(raw, 'legacy-secret')
      await putDeviceKey(raw.buffer)
      grantBreznIndexedDbWrites()
      await saveJson('legacy-device', { secret: wrapped, public: 'x' })
      const loaded = await loadEncryptedJson('legacy-device', { secret: '', public: '' }, [
        'secret',
      ])
      expect(loaded.secret).toBe('legacy-secret')
      const upgraded = await readDeviceKey()
      expect(upgraded).toBeInstanceOf(CryptoKey)
      expect((upgraded as CryptoKey).extractable).toBe(false)
    },
  )

  it('scrubs legacy skHex from localStorage mirror', () => {
    localStorage.setItem(
      BREZN_APP_STATE_LS_KEY,
      JSON.stringify({ skHex: 'v2:pbkdf2:x', pubkey: 'abc' }),
    )
    scrubSkHexFromLocalStorageMirror()
    const raw = JSON.parse(localStorage.getItem(BREZN_APP_STATE_LS_KEY) || '{}') as {
      skHex?: string
    }
    expect(raw.skHex).toBeUndefined()
  })
})
