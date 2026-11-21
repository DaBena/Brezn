import Dexie, { type Table } from 'dexie'
import {
  aesGcmDecryptText,
  aesGcmDecryptTextWithCryptoKey,
  aesGcmEncryptText,
  aesGcmEncryptTextWithCryptoKey,
  randomAesKeyBytes,
} from './aesGcm'
import { BREZN_APP_STATE_LS_KEY, STORAGE_WRITE_CONSENT_KEY } from './constants'
import { isDeviceWrappedSk, isLegacyPlainSkHex, isPasswordWrappedSk } from './skVault'

const DB_NAME = 'brezn-storage'
const DB_VERSION = 1
/** Matches legacy `createObjectStore(name)` — primary key is out-of-line (explicit key per put/get). */
const STORE_NAME = 'keyValueStore'

// Encryption key storage key (separate from data)
const ENCRYPTION_KEY_STORAGE_KEY = 'brezn:encryption-key'

/**
 * Set only after IndexedDB holds the secret (or there was nothing to migrate).
 * Until then, app-state writes keep a legacy `skHex` already present in localStorage.
 */
const SK_HEX_IDB_DURABLE_LS_KEY = 'brezn:sk-hex-idb-durable'

let storageConsentGiven = false

class BreznStorageDexie extends Dexie {
  /** Values keyed by string (out-of-line keys); stores arbitrary structured-clone payloads. */
  keyValueStore!: Table<unknown, string>

  constructor() {
    super(DB_NAME)
    this.version(DB_VERSION).stores({
      [STORE_NAME]: '',
    })
  }
}

let storageDbSingleton: BreznStorageDexie | null = null

export function syncBreznIndexedDbWriteConsentFromStorage(): void {
  try {
    storageConsentGiven = localStorage.getItem(STORAGE_WRITE_CONSENT_KEY) === 'true'
  } catch {
    storageConsentGiven = false
  }
  if (!storageConsentGiven) {
    deviceKeyCache = null
    storageDbSingleton?.close()
    storageDbSingleton = null
  }
}

export function isBreznStorageConsentGranted(): boolean {
  return storageConsentGiven
}

export function grantBreznIndexedDbWrites(): void {
  try {
    localStorage.setItem(STORAGE_WRITE_CONSENT_KEY, 'true')
  } catch {
    /* ignore quota / private mode */
  }
  storageConsentGiven = true
  // A key minted before consent exists only in memory. Don't reuse it for durable ciphertext.
  deviceKeyCache = null
}

function getStorageDb(): BreznStorageDexie {
  if (!storageConsentGiven) {
    throw new Error('Storage consent not yet given')
  }
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB not supported')
  }
  if (!storageDbSingleton) storageDbSingleton = new BreznStorageDexie()
  return storageDbSingleton
}

async function loadFromIndexedDB<T>(key: string): Promise<T | null> {
  try {
    const db = getStorageDb()
    const result = await db.keyValueStore.get(key)
    return result !== undefined ? (result as T) : null
  } catch {
    return null
  }
}

/** `ok: false` means the read failed — distinct from a missing record. */
export async function readIndexedDbValue<T>(
  key: string,
): Promise<{ ok: true; value: T | null } | { ok: false }> {
  try {
    const db = getStorageDb()
    const result = await db.keyValueStore.get(key)
    if (result === undefined || result === null) return { ok: true, value: null }
    return { ok: true, value: result as T }
  } catch {
    return { ok: false }
  }
}

async function saveToIndexedDB(key: string, value: unknown): Promise<boolean> {
  try {
    const db = getStorageDb()
    await db.keyValueStore.put(value, key)
    return true
  } catch {
    return false
  }
}

async function saveToIndexedDBOrThrow(key: string, value: unknown): Promise<void> {
  const db = getStorageDb()
  await db.keyValueStore.put(value, key)
}

/**
 * App-state mirror in localStorage must never carry `skHex` (ciphertext or plain).
 * Secret material lives in IndexedDB only (device wrap / password blob).
 */
function stripSkHexForLocalStorageMirror(key: string, value: unknown): unknown {
  if (key !== BREZN_APP_STATE_LS_KEY) return value
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const copy = { ...(value as Record<string, unknown>) }
  delete copy.skHex
  return copy
}

function legacySkHexMirrorRetentionArmed(): boolean {
  try {
    return localStorage.getItem(SK_HEX_IDB_DURABLE_LS_KEY) !== '1'
  } catch {
    return true
  }
}

function readLegacySkHex(key: string): string | undefined {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { skHex?: unknown }
    return typeof parsed.skHex === 'string' && parsed.skHex ? parsed.skHex : undefined
  } catch {
    return undefined
  }
}

/** Remove any legacy `skHex` left in the localStorage app-state mirror. */
export function scrubSkHexFromLocalStorageMirror(key: string = BREZN_APP_STATE_LS_KEY): void {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || !('skHex' in parsed)) return
    delete parsed.skHex
    localStorage.setItem(key, JSON.stringify(parsed))
  } catch {
    /* ignore */
  }
}

/** IndexedDB now has the secret (or there was no legacy secret to keep). */
export function noteSkHexDurableInIndexedDb(): void {
  try {
    localStorage.setItem(SK_HEX_IDB_DURABLE_LS_KEY, '1')
  } catch {
    /* ignore quota / private mode */
  }
  scrubSkHexFromLocalStorageMirror()
}

function writeLocalStorageMirror(key: string, value: unknown): void {
  try {
    let out = stripSkHexForLocalStorageMirror(key, value)
    if (
      key === BREZN_APP_STATE_LS_KEY &&
      legacySkHexMirrorRetentionArmed() &&
      out &&
      typeof out === 'object' &&
      !Array.isArray(out)
    ) {
      const legacy = readLegacySkHex(key)
      if (legacy) out = { ...(out as Record<string, unknown>), skHex: legacy }
    }
    localStorage.setItem(key, JSON.stringify(out))
  } catch {
    // ignore storage quota / private mode issues
  }
}

// Hybrid storage: IndexedDB (primary) + localStorage (fallback + sync)
export async function loadJson<T>(key: string, fallback: T): Promise<T> {
  // Try IndexedDB first (more robust)
  try {
    const indexed = await loadFromIndexedDB<T>(key)
    if (indexed !== null) {
      // Sync settings mirror to localStorage — never reintroduce skHex
      writeLocalStorageMirror(key, indexed)
      return indexed
    }
  } catch {
    // IndexedDB failed or consent off, try localStorage
  }

  // Fallback to localStorage
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as T
    if (storageConsentGiven) {
      try {
        await saveToIndexedDB(key, parsed)
      } catch {
        // ignore IndexedDB sync errors
      }
    }
    // Migrate: scrub skHex if a legacy LS copy still has it
    writeLocalStorageMirror(key, parsed)
    return parsed
  } catch {
    return fallback
  }
}

export async function saveJson(key: string, value: unknown): Promise<void> {
  if (storageConsentGiven) {
    try {
      // IndexedDB keeps full value including encrypted skHex
      await saveToIndexedDB(key, value)
    } catch {
      // IndexedDB failed, continue with localStorage mirror
    }
  }

  writeLocalStorageMirror(key, value)
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
  writeLocalStorageMirror(key, value)
}

// Device-bound AES-GCM wrapping. The wrap key is a non-extractable CryptoKey in IndexedDB.
// Never falls back to plaintext. Without IndexedDB or Web Crypto the key stays in memory only.
type DeviceKey = { kind: 'crypto'; key: CryptoKey } | { kind: 'raw'; bytes: Uint8Array }

let deviceKeyCache: DeviceKey | null = null

function hasSubtleAes(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined'
}

function isAesGcmCryptoKey(value: unknown): value is CryptoKey {
  if (!value || typeof value !== 'object') return false
  // IndexedDB can hand a CryptoKey back from another realm, so instanceof is not enough.
  const sameRealm = typeof CryptoKey !== 'undefined' && value instanceof CryptoKey
  const crossRealm = Object.prototype.toString.call(value) === '[object CryptoKey]'
  if (!sameRealm && !crossRealm) return false
  const key = value as CryptoKey
  const algorithm = key.algorithm
  const name =
    algorithm && typeof algorithm === 'object' && 'name' in algorithm ? algorithm.name : ''
  return key.type === 'secret' && name === 'AES-GCM'
}

function coerceAesKeyBytes(stored: unknown): Uint8Array | null {
  // IndexedDB can hand back binary from another realm, so instanceof is not enough.
  if (ArrayBuffer.isView(stored) && stored.byteLength === 32) {
    return new Uint8Array(stored.buffer, stored.byteOffset, stored.byteLength)
  }
  if (Object.prototype.toString.call(stored) === '[object ArrayBuffer]') {
    const buf = stored as ArrayBuffer
    if (buf.byteLength !== 32) return null
    return new Uint8Array(buf)
  }
  return null
}

function rememberRawDeviceKey(): DeviceKey {
  const key: DeviceKey = { kind: 'raw', bytes: randomAesKeyBytes() }
  deviceKeyCache = key
  return key
}

async function importNonExtractableAesKey(bytes: Uint8Array): Promise<CryptoKey> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return crypto.subtle.importKey('raw', copy, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function getOrCreateDeviceKey(): Promise<DeviceKey> {
  if (deviceKeyCache) return deviceKeyCache

  // No IndexedDB: session key in memory only. Never written to disk.
  if (typeof indexedDB === 'undefined' || !storageConsentGiven) {
    return rememberRawDeviceKey()
  }

  const rec = await readIndexedDbValue<unknown>(ENCRYPTION_KEY_STORAGE_KEY)
  if (!rec.ok) {
    throw new Error('Encryption key storage is unavailable')
  }

  // Web Crypto missing: use a legacy raw key if one is already stored. Do not write a new raw key.
  if (!hasSubtleAes()) {
    if (rec.value == null) return rememberRawDeviceKey()
    const existing = coerceAesKeyBytes(rec.value)
    if (!existing) throw new Error('Stored encryption key is unreadable')
    const key: DeviceKey = { kind: 'raw', bytes: existing }
    deviceKeyCache = key
    return key
  }

  if (rec.value != null) {
    if (isAesGcmCryptoKey(rec.value)) {
      const key: DeviceKey = { kind: 'crypto', key: rec.value }
      deviceKeyCache = key
      return key
    }
    const existing = coerceAesKeyBytes(rec.value)
    if (!existing) {
      throw new Error('Stored encryption key is unreadable')
    }
    const cryptoKey = await importNonExtractableAesKey(existing)
    await saveToIndexedDBOrThrow(ENCRYPTION_KEY_STORAGE_KEY, cryptoKey)
    const key: DeviceKey = { kind: 'crypto', key: cryptoKey }
    deviceKeyCache = key
    return key
  }

  const cryptoKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
  await saveToIndexedDBOrThrow(ENCRYPTION_KEY_STORAGE_KEY, cryptoKey)
  const key: DeviceKey = { kind: 'crypto', key: cryptoKey }
  deviceKeyCache = key
  return key
}

async function encryptText(plaintext: string): Promise<string> {
  const key = await getOrCreateDeviceKey()
  if (key.kind === 'crypto') return aesGcmEncryptTextWithCryptoKey(key.key, plaintext)
  return aesGcmEncryptText(key.bytes, plaintext)
}

/**
 * Decrypt a device-wrapped field. Legacy plaintext (64-hex) is returned as-is for one-shot migration.
 * Password-wrapped blobs are left untouched (caller handles unlock).
 */
async function decryptText(ciphertext: string): Promise<string> {
  if (isPasswordWrappedSk(ciphertext)) return ciphertext
  if (isLegacyPlainSkHex(ciphertext)) return ciphertext
  if (!isDeviceWrappedSk(ciphertext)) {
    throw new Error('Unrecognized secret key encoding')
  }
  const key = await getOrCreateDeviceKey()
  if (key.kind === 'crypto') return aesGcmDecryptTextWithCryptoKey(key.key, ciphertext)
  return aesGcmDecryptText(key.bytes, ciphertext)
}

// Encrypted storage functions for sensitive data
export async function loadEncryptedJson<T extends Record<string, unknown>>(
  key: string,
  fallback: T,
  encryptedFields: (keyof T)[],
): Promise<T> {
  const data = await loadJson<T>(key, fallback)

  for (const field of encryptedFields) {
    const value = data[field]
    if (typeof value === 'string' && value) {
      if (isPasswordWrappedSk(value)) continue
      try {
        data[field] = (await decryptText(value)) as T[keyof T]
      } catch (error) {
        const isOperationError = error instanceof DOMException && error.name === 'OperationError'
        if (!isOperationError) {
          console.warn('Decryption failed for field', String(field), error)
        }
        // Keep ciphertext so callers can detect wrapped/locked state — never invent plaintext.
      }
    }
  }

  return data
}

/** @returns whether IndexedDB accepted the write. localStorage mirror is still updated. */
export async function saveEncryptedJson<T extends Record<string, unknown>>(
  key: string,
  value: T,
  encryptedFields: (keyof T)[],
): Promise<boolean> {
  const data = { ...value }

  for (const field of encryptedFields) {
    const fieldValue = data[field]
    if (typeof fieldValue === 'string' && fieldValue) {
      if (isPasswordWrappedSk(fieldValue)) {
        // Already password-wrapped — persist as-is (never device-wrap or plaintext).
        continue
      }
      if (isDeviceWrappedSk(fieldValue)) {
        // Already device-wrapped (e.g. re-save without decrypt) — leave unchanged.
        continue
      }
      // Fail closed: encryption errors propagate; do not write plaintext.
      data[field] = (await encryptText(fieldValue)) as T[keyof T]
    }
  }

  let idbOk = false
  if (storageConsentGiven) {
    idbOk = await saveToIndexedDB(key, data)
  }
  writeLocalStorageMirror(key, data)
  return idbOk
}
