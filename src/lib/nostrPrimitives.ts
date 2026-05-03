/**
 * Nostr primitives for Brezn: NDK for `nip19`, local wire types, Noble for keys + NIP-04.
 *
 * Brezn code does not import `nostr-tools` directly. `nostr-tools` remains a **runtime**
 * dependency only because `@nostr-dev-kit/ndk` resolves it from the app `node_modules`
 * (NDK’s bundle imports that package).
 */
import { cbc } from '@noble/ciphers/aes'
import { schnorr, secp256k1 } from '@noble/curves/secp256k1'
import { bytesToHex, randomBytes } from '@noble/hashes/utils'
import { base64 } from '@scure/base'
import { nip19 } from '@nostr-dev-kit/ndk'

export type { Event, Filter } from './nostrWireTypes'
export { nip19 }

const utf8Decoder = new TextDecoder('utf-8')
const utf8Encoder = new TextEncoder()

function getNormalizedX(key: Uint8Array): Uint8Array {
  return key.slice(1, 33)
}

/** NIP-04 (same wire format as `nostr-tools` nip04). */
export const nip04 = {
  encrypt(secretKey: string | Uint8Array, pubkey: string, text: string): string {
    const privkey = secretKey instanceof Uint8Array ? bytesToHex(secretKey) : secretKey
    const key = secp256k1.getSharedSecret(privkey, `02${pubkey}`)
    const normalizedKey = getNormalizedX(key)
    const iv = Uint8Array.from(randomBytes(16))
    const plaintext = utf8Encoder.encode(text)
    const ciphertext = cbc(normalizedKey, iv).encrypt(plaintext)
    const ctb64 = base64.encode(new Uint8Array(ciphertext))
    const ivb64 = base64.encode(new Uint8Array(iv))
    return `${ctb64}?iv=${ivb64}`
  },
  decrypt(secretKey: string | Uint8Array, pubkey: string, data: string): string {
    const privkey = secretKey instanceof Uint8Array ? bytesToHex(secretKey) : secretKey
    const [ctb64, ivb64] = data.split('?iv=')
    const key = secp256k1.getSharedSecret(privkey, `02${pubkey}`)
    const normalizedKey = getNormalizedX(key)
    const iv = base64.decode(ivb64!)
    const ciphertext = base64.decode(ctb64!)
    const plaintext = cbc(normalizedKey, iv).decrypt(ciphertext)
    return utf8Decoder.decode(plaintext)
  },
}

export function generateSecretKey(): Uint8Array {
  return schnorr.utils.randomPrivateKey()
}

export function getPublicKey(secretKey: Uint8Array): string {
  return bytesToHex(schnorr.getPublicKey(secretKey))
}
