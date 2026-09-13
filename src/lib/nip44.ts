/**
 * NIP-44 v2 encrypted payloads (ChaCha20 + HMAC-SHA256).
 * Wire-compatible with `nostr-tools` / paulmillr nip44.
 */
import { chacha20 } from '@noble/ciphers/chacha.js'
import { equalBytes } from '@noble/ciphers/utils.js'
import { secp256k1 } from '@noble/curves/secp256k1'
import { extract as hkdfExtract, expand as hkdfExpand } from '@noble/hashes/hkdf'
import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex, concatBytes, randomBytes } from '@noble/hashes/utils'
import { base64 } from '@scure/base'

const utf8Decoder = new TextDecoder('utf-8')
const utf8Encoder = new TextEncoder()

const minPlaintextSize = 1
const maxPlaintextSize = 4294967295
const extendedPrefixThreshold = 65536

function asPrivHex(secretKey: string | Uint8Array): string {
  return typeof secretKey === 'string' ? secretKey : bytesToHex(secretKey)
}

export function getConversationKey(privkeyA: string | Uint8Array, pubkeyB: string): Uint8Array {
  const priv = asPrivHex(privkeyA)
  const sharedX = secp256k1.getSharedSecret(priv, `02${pubkeyB}`).subarray(1, 33)
  return hkdfExtract(sha256, sharedX, utf8Encoder.encode('nip44-v2'))
}

function getMessageKeys(conversationKey: Uint8Array, nonce: Uint8Array) {
  if (conversationKey.length !== 32) throw new Error('invalid conversation_key length')
  if (nonce.length !== 32) throw new Error('invalid nonce length')
  const keys = hkdfExpand(sha256, conversationKey, nonce, 76)
  return {
    chacha_key: keys.subarray(0, 32),
    chacha_nonce: keys.subarray(32, 44),
    hmac_key: keys.subarray(44, 76),
  }
}

export function calcPaddedLen(len: number): number {
  if (!Number.isSafeInteger(len) || len < 1) throw new Error('expected positive integer')
  if (len <= 32) return 32
  const nextPower = 2 ** (Math.floor(Math.log2(len - 1)) + 1)
  const chunk = nextPower <= 256 ? 32 : nextPower / 8
  return chunk * (Math.floor((len - 1) / chunk) + 1)
}

function writeU16BE(num: number): Uint8Array {
  if (!Number.isSafeInteger(num) || num < minPlaintextSize || num > 65535) {
    throw new Error('invalid plaintext size: must be between 1 and 65535 bytes')
  }
  const arr = new Uint8Array(2)
  new DataView(arr.buffer).setUint16(0, num, false)
  return arr
}

function writeU32BE(num: number): Uint8Array {
  if (!Number.isSafeInteger(num) || num < extendedPrefixThreshold || num > maxPlaintextSize) {
    throw new Error('invalid plaintext size: must be between 65536 and 4294967295 bytes')
  }
  const arr = new Uint8Array(4)
  new DataView(arr.buffer).setUint32(0, num, false)
  return arr
}

function pad(plaintext: string): Uint8Array {
  const unpadded = utf8Encoder.encode(plaintext)
  const unpaddedLen = unpadded.length
  if (unpaddedLen < minPlaintextSize || unpaddedLen > maxPlaintextSize) {
    throw new Error('invalid plaintext size: must be between 1 and 4294967295 bytes')
  }
  const prefix =
    unpaddedLen >= extendedPrefixThreshold
      ? concatBytes(new Uint8Array([0, 0]), writeU32BE(unpaddedLen))
      : writeU16BE(unpaddedLen)
  const suffix = new Uint8Array(calcPaddedLen(unpaddedLen) - unpaddedLen)
  return concatBytes(prefix, unpadded, suffix)
}

function unpad(padded: Uint8Array): string {
  const dv = new DataView(padded.buffer, padded.byteOffset, padded.byteLength)
  const firstTwo = dv.getUint16(0)
  let unpaddedLen: number
  let prefixLen: number
  if (firstTwo === 0) {
    unpaddedLen = dv.getUint32(2)
    if (unpaddedLen < extendedPrefixThreshold) throw new Error('invalid padding')
    prefixLen = 6
  } else {
    unpaddedLen = firstTwo
    prefixLen = 2
  }
  const unpadded = padded.subarray(prefixLen, prefixLen + unpaddedLen)
  if (
    unpaddedLen < minPlaintextSize ||
    unpaddedLen > maxPlaintextSize ||
    unpadded.length !== unpaddedLen ||
    padded.length !== prefixLen + calcPaddedLen(unpaddedLen)
  ) {
    throw new Error('invalid padding')
  }
  return utf8Decoder.decode(unpadded)
}

function hmacAad(key: Uint8Array, message: Uint8Array, aad: Uint8Array): Uint8Array {
  if (aad.length !== 32) throw new Error('AAD associated data must be 32 bytes')
  return hmac(sha256, key, concatBytes(aad, message))
}

function decodePayload(payload: string): {
  nonce: Uint8Array
  ciphertext: Uint8Array
  mac: Uint8Array
} {
  if (typeof payload !== 'string') throw new Error('payload must be a valid string')
  const plen = payload.length
  if (plen < 132) throw new Error('invalid payload length: ' + plen)
  if (payload[0] === '#') throw new Error('unknown encryption version')
  let data: Uint8Array
  try {
    data = base64.decode(payload)
  } catch (error) {
    throw new Error('invalid base64: ' + (error instanceof Error ? error.message : String(error)))
  }
  const dlen = data.length
  if (dlen < 99) throw new Error('invalid data length: ' + dlen)
  if (data[0] !== 2) throw new Error('unknown encryption version ' + data[0])
  return {
    nonce: data.subarray(1, 33),
    ciphertext: data.subarray(33, -32),
    mac: data.subarray(-32),
  }
}

export function encrypt(
  plaintext: string,
  conversationKey: Uint8Array,
  nonce: Uint8Array = randomBytes(32),
): string {
  const { chacha_key, chacha_nonce, hmac_key } = getMessageKeys(conversationKey, nonce)
  const padded = pad(plaintext)
  const ciphertext = chacha20(chacha_key, chacha_nonce, padded)
  const mac = hmacAad(hmac_key, ciphertext, nonce)
  return base64.encode(concatBytes(new Uint8Array([2]), nonce, ciphertext, mac))
}

export function decrypt(payload: string, conversationKey: Uint8Array): string {
  const { nonce, ciphertext, mac } = decodePayload(payload)
  const { chacha_key, chacha_nonce, hmac_key } = getMessageKeys(conversationKey, nonce)
  const calculatedMac = hmacAad(hmac_key, ciphertext, nonce)
  if (!equalBytes(calculatedMac, mac)) throw new Error('invalid MAC')
  const padded = chacha20(chacha_key, chacha_nonce, ciphertext)
  return unpad(padded)
}

/** Encrypt plaintext to a pubkey using the sender secret key (NIP-44 v2). */
export function encryptToPubkey(
  plaintext: string,
  senderSecretKey: string | Uint8Array,
  recipientPubkey: string,
): string {
  return encrypt(plaintext, getConversationKey(senderSecretKey, recipientPubkey))
}

/** Decrypt NIP-44 payload from a peer pubkey. */
export function decryptFromPubkey(
  payload: string,
  recipientSecretKey: string | Uint8Array,
  senderPubkey: string,
): string {
  return decrypt(payload, getConversationKey(recipientSecretKey, senderPubkey))
}

/** Convenience: accept hex privkey like NIP-04 helpers. */
export const nip44 = {
  getConversationKey,
  encrypt: (secretKey: string | Uint8Array, pubkey: string, text: string) =>
    encryptToPubkey(text, secretKey, pubkey),
  decrypt: (secretKey: string | Uint8Array, pubkey: string, data: string) =>
    decryptFromPubkey(data, secretKey, pubkey),
  v2: {
    utils: { getConversationKey, calcPaddedLen },
    encrypt,
    decrypt,
  },
}
