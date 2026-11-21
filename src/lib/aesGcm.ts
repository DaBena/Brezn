/**
 * AES-256-GCM helpers: prefer Web Crypto, fall back to @noble/ciphers (no plaintext path).
 */
import { gcm } from '@noble/ciphers/aes.js'
import { randomBytes } from '@noble/hashes/utils'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function hasSubtle(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined'
}

/** Fresh ArrayBuffer-backed view for Web Crypto BufferSource typing. */
function asBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return btoa(s)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function randomAesIv(): Uint8Array {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint8Array(12))
  }
  return randomBytes(12)
}

export function randomAesKeyBytes(): Uint8Array {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint8Array(32))
  }
  return randomBytes(32)
}

/** Pack IV + ciphertext(+tag) as `base64(iv):base64(ct)`. */
export function packIvCiphertext(iv: Uint8Array, ciphertext: Uint8Array): string {
  return `${bytesToBase64(iv)}:${bytesToBase64(ciphertext)}`
}

export function unpackIvCiphertext(packed: string): { iv: Uint8Array; ciphertext: Uint8Array } {
  const idx = packed.indexOf(':')
  if (idx <= 0 || idx === packed.length - 1) {
    throw new Error('Invalid AES-GCM ciphertext format')
  }
  const ivBase64 = packed.slice(0, idx)
  const encryptedBase64 = packed.slice(idx + 1)
  if (!ivBase64 || !encryptedBase64 || encryptedBase64.includes(':')) {
    throw new Error('Invalid AES-GCM ciphertext format')
  }
  return { iv: base64ToBytes(ivBase64), ciphertext: base64ToBytes(encryptedBase64) }
}

async function encryptWithSubtle(
  keyBytes: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    asBufferSource(keyBytes),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  )
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv) },
    key,
    asBufferSource(plaintext),
  )
  return new Uint8Array(encrypted)
}

async function decryptWithSubtle(
  keyBytes: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    asBufferSource(keyBytes),
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  )
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv) },
    key,
    asBufferSource(ciphertext),
  )
  return new Uint8Array(decrypted)
}

function encryptWithNoble(keyBytes: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Uint8Array {
  return gcm(keyBytes, iv).encrypt(plaintext)
}

function decryptWithNoble(
  keyBytes: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Uint8Array {
  return gcm(keyBytes, iv).decrypt(ciphertext)
}

export async function aesGcmEncryptBytes(
  keyBytes: Uint8Array,
  plaintext: Uint8Array,
  iv: Uint8Array = randomAesIv(),
): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  if (keyBytes.length !== 32) throw new Error('AES-GCM key must be 32 bytes')
  if (iv.length !== 12) throw new Error('AES-GCM IV must be 12 bytes')

  if (hasSubtle()) {
    try {
      const ciphertext = await encryptWithSubtle(keyBytes, iv, plaintext)
      return { iv, ciphertext }
    } catch {
      /* fall through to noble */
    }
  }
  return { iv, ciphertext: encryptWithNoble(keyBytes, iv, plaintext) }
}

export async function aesGcmDecryptBytes(
  keyBytes: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  if (keyBytes.length !== 32) throw new Error('AES-GCM key must be 32 bytes')
  if (iv.length !== 12) throw new Error('AES-GCM IV must be 12 bytes')

  if (hasSubtle()) {
    try {
      return await decryptWithSubtle(keyBytes, iv, ciphertext)
    } catch (error) {
      // Authentication failure must stay a failure. Other subtle errors can try noble.
      if (
        error instanceof DOMException &&
        (error.name === 'OperationError' || error.name === 'InvalidAccessError')
      ) {
        throw error
      }
    }
  }
  return decryptWithNoble(keyBytes, iv, ciphertext)
}

export async function aesGcmEncryptText(keyBytes: Uint8Array, plaintext: string): Promise<string> {
  const { iv, ciphertext } = await aesGcmEncryptBytes(keyBytes, textEncoder.encode(plaintext))
  return packIvCiphertext(iv, ciphertext)
}

export async function aesGcmDecryptText(keyBytes: Uint8Array, packed: string): Promise<string> {
  const { iv, ciphertext } = unpackIvCiphertext(packed)
  const plain = await aesGcmDecryptBytes(keyBytes, iv, ciphertext)
  return textDecoder.decode(plain)
}

/** Encrypt with a non-extractable AES-GCM CryptoKey. No raw-key fallback. */
export async function aesGcmEncryptTextWithCryptoKey(
  key: CryptoKey,
  plaintext: string,
): Promise<string> {
  const iv = randomAesIv()
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv) },
    key,
    asBufferSource(textEncoder.encode(plaintext)),
  )
  return packIvCiphertext(iv, new Uint8Array(encrypted))
}

/** Decrypt with a non-extractable AES-GCM CryptoKey. Authentication failure throws. */
export async function aesGcmDecryptTextWithCryptoKey(
  key: CryptoKey,
  packed: string,
): Promise<string> {
  const { iv, ciphertext } = unpackIvCiphertext(packed)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv) },
    key,
    asBufferSource(ciphertext),
  )
  return textDecoder.decode(plain)
}

export { bytesToBase64, base64ToBytes }
