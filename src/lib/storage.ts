// IndexedDB setup for robust persistent storage
const DB_NAME = 'brezn-storage'
const DB_VERSION = 1
const STORE_NAME = 'keyValueStore'

// Encryption key storage key (separate from data)
const ENCRYPTION_KEY_STORAGE_KEY = 'brezn:encryption-key'

/** IndexedDB is only opened after user has consented (first "Allow location"). */
let storageConsentGiven = false
let dbPromise: Promise<IDBDatabase> | null = null

/** Call with true after user has clicked "Allow location". Enables opening brezn-storage (IndexedDB). */
export function setStorageConsentGiven(value: boolean): void {
  storageConsentGiven = value
  if (value) dbPromise = null
}

function getDB(): Promise<IDBDatabase> {
  if (!storageConsentGiven) {
    return Promise.reject(new Error('Storage consent not yet given'))
  }
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })

  return dbPromise
}

async function loadFromIndexedDB<T>(key: string): Promise<T | null> {
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(key)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const result = request.result
        resolve(result !== undefined ? (result as T) : null)
      }
    })
  } catch {
    return null
  }
}

async function saveToIndexedDB(key: string, value: unknown): Promise<void> {
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put(value, key)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  } catch {
    // ignore IndexedDB errors, fallback to localStorage
  }
}

// Hybrid storage: IndexedDB (primary) + localStorage (fallback + sync)
export async function loadJson<T>(key: string, fallback: T): Promise<T> {
  // Try IndexedDB first (more robust)
  try {
    const indexed = await loadFromIndexedDB<T>(key)
    if (indexed !== null) {
      // Sync to localStorage as backup
      try {
        localStorage.setItem(key, JSON.stringify(indexed))
      } catch {
        // ignore localStorage sync errors
      }
      return indexed
    }
  } catch {
    // IndexedDB failed, try localStorage
  }

  // Fallback to localStorage
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as T
    // Sync to IndexedDB if localStorage had data
    try {
      await saveToIndexedDB(key, parsed)
    } catch {
      // ignore IndexedDB sync errors
    }
    return parsed
  } catch {
    return fallback
  }
}

export async function saveJson(key: string, value: unknown): Promise<void> {
  // Save to both IndexedDB and localStorage for redundancy
  const serialized = JSON.stringify(value)

  // Save to IndexedDB (primary)
  try {
    await saveToIndexedDB(key, value)
  } catch {
    // IndexedDB failed, continue with localStorage
  }

  // Save to localStorage (fallback)
  try {
    localStorage.setItem(key, serialized)
  } catch {
    // ignore storage quota / private mode issues
  }
}

export function loadJsonSync<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveJsonSync(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore storage quota / private mode issues
  }
}

// Encryption utilities using Web Crypto API
// Cache the encryption key in memory to avoid repeated IndexedDB lookups
let encryptionKeyCache: CryptoKey | null = null

async function getOrCreateEncryptionKey(): Promise<CryptoKey> {
  // Return cached key if available
  if (encryptionKeyCache) {
    return encryptionKeyCache
  }

  // Try to load existing key from IndexedDB
  try {
    const keyData = await loadFromIndexedDB<ArrayBuffer>(ENCRYPTION_KEY_STORAGE_KEY)
    if (keyData && keyData.byteLength > 0) {
      const key = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
      encryptionKeyCache = key
      return key
    }
  } catch (error) {
    // Key doesn't exist or failed to load, create new one
    console.warn('Failed to load encryption key, generating new one:', error)
  }

  // Generate new encryption key
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  encryptionKeyCache = key
  
  // Export and save the key
  try {
    const exportedKey = await crypto.subtle.exportKey('raw', key)
    await saveToIndexedDB(ENCRYPTION_KEY_STORAGE_KEY, exportedKey)
  } catch (error) {
    // If IndexedDB fails, we can't persist the key, but we can still use it in memory
    // The key will be regenerated on next load, but that's acceptable for obfuscation
    console.warn('Failed to save encryption key to IndexedDB:', error)
  }
  
  return key
}

async function encryptText(plaintext: string): Promise<string> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      // Web Crypto API not available, return plaintext (fallback)
      return plaintext
    }

    const key = await getOrCreateEncryptionKey()
    const encoder = new TextEncoder()
    const data = encoder.encode(plaintext)
    
    // Generate random IV for each encryption
    const iv = crypto.getRandomValues(new Uint8Array(12))
    
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
    
    // Combine IV and encrypted data: base64(iv) + ':' + base64(encrypted)
    const ivBase64 = btoa(String.fromCharCode(...iv))
    const encryptedBase64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)))
    
    return `${ivBase64}:${encryptedBase64}`
  } catch {
    // Encryption failed, return plaintext (fallback)
    return plaintext
  }
}

async function decryptText(ciphertext: string): Promise<string> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      // Web Crypto API not available, assume plaintext (fallback)
      return ciphertext
    }

    // Check if it's encrypted format (contains ':')
    if (!ciphertext.includes(':')) {
      // Old plaintext format, return as-is
      return ciphertext
    }

    const [ivBase64, encryptedBase64] = ciphertext.split(':')
    if (!ivBase64 || !encryptedBase64) {
      // Invalid format, assume plaintext
      return ciphertext
    }

    const key = await getOrCreateEncryptionKey()
    
    // Decode IV and encrypted data
    const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0))
    const encrypted = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0))
    
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted)
    
    const decoder = new TextDecoder()
    return decoder.decode(decrypted)
  } catch (error) {
    // Decryption failed - e.g. wrong key (IndexedDB cleared / consent flow), corrupted data, or old plaintext
    // Return as-is; caller treats as plaintext. Avoid noisy warn for expected OperationError.
    const isOperationError =
      error instanceof DOMException && error.name === 'OperationError'
    if (!isOperationError) {
      console.warn('Decryption failed, assuming plaintext:', error)
    }
    return ciphertext
  }
}

// Encrypted storage functions for sensitive data
export async function loadEncryptedJson<T extends Record<string, unknown>>(
  key: string,
  fallback: T,
  encryptedFields: (keyof T)[],
): Promise<T> {
  const data = await loadJson<T>(key, fallback)
  
  // Decrypt specified fields
  for (const field of encryptedFields) {
    const value = data[field]
    if (typeof value === 'string' && value) {
      try {
        const decrypted = await decryptText(value)
        data[field] = decrypted as T[keyof T]
      } catch {
        // Decryption failed, keep original value (might be plaintext from old version)
      }
    }
  }
  
  return data
}

export async function saveEncryptedJson<T extends Record<string, unknown>>(
  key: string,
  value: T,
  encryptedFields: (keyof T)[],
): Promise<void> {
  // Create a copy to avoid mutating the original
  const data = { ...value }
  
  // Encrypt specified fields
  for (const field of encryptedFields) {
    const fieldValue = data[field]
    if (typeof fieldValue === 'string' && fieldValue) {
      try {
        const encrypted = await encryptText(fieldValue)
        data[field] = encrypted as T[keyof T]
      } catch {
        // Encryption failed, keep original value
      }
    }
  }
  
  await saveJson(key, data)
}

