/**
 * Optional password wrapping for the Nostr secret key (PBKDF2 + AES-GCM).
 * Never stores the password or derived key at rest.
 */
import { pbkdf2Async } from '@noble/hashes/pbkdf2'
import { sha256 } from '@noble/hashes/sha2'
import {
  aesGcmDecryptBytes,
  aesGcmEncryptBytes,
  base64ToBytes,
  bytesToBase64,
  randomAesIv,
  randomAesKeyBytes,
} from './aesGcm'

export const SK_PROTECTION_DEVICE = 'device' as const
export const SK_PROTECTION_PASSWORD = 'password' as const
export type SkProtection = typeof SK_PROTECTION_DEVICE | typeof SK_PROTECTION_PASSWORD

/** OWASP PBKDF2-HMAC-SHA256 iteration count for new wraps (stored in the blob). */
export const PBKDF2_ITERATIONS = 600_000

const PASSWORD_WRAP_PREFIX = 'v2:pbkdf2:'

const textEncoder = new TextEncoder()

export function isPasswordWrappedSk(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.startsWith(PASSWORD_WRAP_PREFIX)
}

export function isLegacyPlainSkHex(value: string | undefined | null): boolean {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value)
}

/** Device-wrapped ciphertext uses a single `iv:ct` (no extra colons in the scheme). */
export function isDeviceWrappedSk(value: string | undefined | null): boolean {
  if (
    typeof value !== 'string' ||
    !value ||
    isPasswordWrappedSk(value) ||
    isLegacyPlainSkHex(value)
  ) {
    return false
  }
  const idx = value.indexOf(':')
  return idx > 0 && value.indexOf(':', idx + 1) === -1
}

function hasSubtlePbkdf2(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined'
}

export async function deriveAesKeyFromPassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  if (!password) throw new Error('Password required')
  if (salt.length < 16) throw new Error('Salt too short')
  if (iterations < 100_000) throw new Error('PBKDF2 iteration count too low')

  if (hasSubtlePbkdf2()) {
    try {
      const saltCopy = new Uint8Array(salt.byteLength)
      saltCopy.set(salt)
      const baseKey = await crypto.subtle.importKey(
        'raw',
        textEncoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits'],
      )
      const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: saltCopy, iterations, hash: 'SHA-256' },
        baseKey,
        256,
      )
      return new Uint8Array(bits)
    } catch {
      /* fall through to noble */
    }
  }

  return pbkdf2Async(sha256, password, salt, { c: iterations, dkLen: 32 })
}

export async function wrapSkWithPassword(skHex: string, password: string): Promise<string> {
  if (!isLegacyPlainSkHex(skHex)) throw new Error('Expected 64-char hex secret key')
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters')
  }

  const salt = randomAesKeyBytes().slice(0, 16)
  const iterations = PBKDF2_ITERATIONS
  const key = await deriveAesKeyFromPassword(password, salt, iterations)
  const iv = randomAesIv()
  const { ciphertext } = await aesGcmEncryptBytes(key, textEncoder.encode(skHex), iv)

  return [
    'v2',
    'pbkdf2',
    String(iterations),
    bytesToBase64(salt),
    bytesToBase64(iv),
    bytesToBase64(ciphertext),
  ].join(':')
}

export async function unwrapSkWithPassword(wrapped: string, password: string): Promise<string> {
  if (!isPasswordWrappedSk(wrapped)) throw new Error('Not a password-wrapped secret key')
  if (!password) throw new Error('Password required')

  const parts = wrapped.split(':')
  // v2 : pbkdf2 : iterations : salt : iv : ct  → 6 parts
  if (parts.length !== 6 || parts[0] !== 'v2' || parts[1] !== 'pbkdf2') {
    throw new Error('Invalid password-wrapped key format')
  }
  const iterations = Number(parts[2])
  if (!Number.isFinite(iterations) || iterations < 100_000) {
    throw new Error('Invalid PBKDF2 iteration count')
  }
  const salt = base64ToBytes(parts[3]!)
  const iv = base64ToBytes(parts[4]!)
  const ciphertext = base64ToBytes(parts[5]!)
  const key = await deriveAesKeyFromPassword(password, salt, iterations)
  const plain = await aesGcmDecryptBytes(key, iv, ciphertext)
  const skHex = new TextDecoder().decode(plain)
  if (!isLegacyPlainSkHex(skHex)) throw new Error('Decrypted key is invalid')
  return skHex.toLowerCase()
}

/** Session state after unlock (derived key kept so saves can re-wrap without storing the password). */
export type PasswordSession = {
  skHex: string
  wrapKey: Uint8Array
  salt: Uint8Array
  iterations: number
}

export async function openPasswordSession(
  wrapped: string,
  password: string,
): Promise<PasswordSession> {
  if (!isPasswordWrappedSk(wrapped)) throw new Error('Not a password-wrapped secret key')
  if (!password) throw new Error('Password required')
  const parts = wrapped.split(':')
  if (parts.length !== 6 || parts[0] !== 'v2' || parts[1] !== 'pbkdf2') {
    throw new Error('Invalid password-wrapped key format')
  }
  const iterations = Number(parts[2])
  if (!Number.isFinite(iterations) || iterations < 100_000) {
    throw new Error('Invalid PBKDF2 iteration count')
  }
  const salt = base64ToBytes(parts[3]!)
  const iv = base64ToBytes(parts[4]!)
  const ciphertext = base64ToBytes(parts[5]!)
  const wrapKey = await deriveAesKeyFromPassword(password, salt, iterations)
  const plain = await aesGcmDecryptBytes(wrapKey, iv, ciphertext)
  const skHex = new TextDecoder().decode(plain)
  if (!isLegacyPlainSkHex(skHex)) throw new Error('Decrypted key is invalid')
  return { skHex: skHex.toLowerCase(), wrapKey, salt, iterations }
}

export async function rewrapSkWithSession(session: PasswordSession): Promise<string> {
  const iv = randomAesIv()
  const { ciphertext } = await aesGcmEncryptBytes(
    session.wrapKey,
    textEncoder.encode(session.skHex),
    iv,
  )
  return [
    'v2',
    'pbkdf2',
    String(session.iterations),
    bytesToBase64(session.salt),
    bytesToBase64(iv),
    bytesToBase64(ciphertext),
  ].join(':')
}
