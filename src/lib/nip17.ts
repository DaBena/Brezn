/**
 * NIP-17 private DMs via NIP-59 gift wrap + NIP-44.
 * Rumors are unsigned kind-14 chat messages; only kind-1059 wraps are published.
 */
import { schnorr } from '@noble/curves/secp256k1'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { generateSecretKey, getPublicKey } from './nostrPrimitives'
import type { Event } from './nostrWireTypes'
import { decryptFromPubkey, encryptToPubkey } from './nip44'

export const NIP17_KINDS = {
  seal: 13,
  chat: 14,
  giftWrap: 1059,
  dmRelays: 10050,
} as const

const TWO_DAYS_SEC = 2 * 24 * 60 * 60
const utf8Encoder = new TextEncoder()

export type UnsignedEvent = {
  kind: number
  tags: string[][]
  content: string
  created_at: number
  pubkey: string
}

export type Rumor = UnsignedEvent & { id: string }

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

function randomPastCreatedAt(): number {
  return Math.round(nowSec() - Math.random() * TWO_DAYS_SEC)
}

function isHex32(input: string): boolean {
  if (input.length !== 64) return false
  for (let i = 0; i < 64; i++) {
    const cc = input.charCodeAt(i)
    if (cc < 48 || cc > 102 || (cc > 57 && cc < 97)) return false
  }
  return true
}

function validateEventShape(event: UnsignedEvent): boolean {
  if (typeof event.kind !== 'number') return false
  if (typeof event.content !== 'string') return false
  if (typeof event.created_at !== 'number') return false
  if (typeof event.pubkey !== 'string' || !isHex32(event.pubkey)) return false
  if (!Array.isArray(event.tags)) return false
  for (const tag of event.tags) {
    if (!Array.isArray(tag)) return false
    for (const part of tag) {
      if (typeof part !== 'string') return false
    }
  }
  return true
}

export function getEventHash(event: UnsignedEvent): string {
  if (!validateEventShape(event)) {
    throw new Error("can't serialize event with wrong or missing properties")
  }
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ])
  return bytesToHex(sha256(utf8Encoder.encode(serialized)))
}

export function finalizeEvent(
  template: Omit<Event, 'id' | 'pubkey' | 'sig'> & { pubkey?: string },
  secretKey: string | Uint8Array,
): Event {
  const sk = typeof secretKey === 'string' ? hexToBytes(secretKey) : secretKey
  const pubkey = bytesToHex(schnorr.getPublicKey(sk))
  const event: UnsignedEvent = {
    kind: template.kind,
    tags: template.tags,
    content: template.content,
    created_at: template.created_at,
    pubkey,
  }
  const id = getEventHash(event)
  const sig = bytesToHex(schnorr.sign(hexToBytes(id), sk))
  return { ...event, id, sig }
}

export function verifyEvent(event: Event): boolean {
  try {
    if (!validateEventShape(event)) return false
    if (typeof event.id !== 'string' || typeof event.sig !== 'string') return false
    const hash = getEventHash(event)
    if (hash !== event.id) return false
    return schnorr.verify(hexToBytes(event.sig), hexToBytes(hash), hexToBytes(event.pubkey))
  } catch {
    return false
  }
}

function encryptJson(data: unknown, privateKey: string | Uint8Array, publicKey: string): string {
  return encryptToPubkey(JSON.stringify(data), privateKey, publicKey)
}

function decryptJson<T>(content: string, privateKey: string | Uint8Array, senderPubkey: string): T {
  return JSON.parse(decryptFromPubkey(content, privateKey, senderPubkey)) as T
}

export function createChatRumor(
  senderSecretKey: string | Uint8Array,
  recipientPubkey: string,
  message: string,
  createdAt: number = nowSec(),
): Rumor {
  const sk = typeof senderSecretKey === 'string' ? hexToBytes(senderSecretKey) : senderSecretKey
  const rumor: UnsignedEvent = {
    kind: NIP17_KINDS.chat,
    created_at: createdAt,
    content: message,
    tags: [['p', recipientPubkey.toLowerCase()]],
    pubkey: getPublicKey(sk),
  }
  return { ...rumor, id: getEventHash(rumor) }
}

function createSeal(rumor: Rumor, privateKey: string | Uint8Array, recipientPubkey: string): Event {
  return finalizeEvent(
    {
      kind: NIP17_KINDS.seal,
      content: encryptJson(rumor, privateKey, recipientPubkey),
      created_at: randomPastCreatedAt(),
      tags: [],
    },
    privateKey,
  )
}

function createWrap(seal: Event, recipientPubkey: string): Event {
  const randomKey = generateSecretKey()
  return finalizeEvent(
    {
      kind: NIP17_KINDS.giftWrap,
      content: encryptJson(seal, randomKey, recipientPubkey),
      created_at: randomPastCreatedAt(),
      tags: [['p', recipientPubkey.toLowerCase()]],
    },
    randomKey,
  )
}

/** Build gift wraps for recipient and sender (self-copy), sharing one rumor. */
export function wrapDirectMessage(
  senderSecretKey: string | Uint8Array,
  recipientPubkey: string,
  message: string,
): { rumor: Rumor; wraps: Event[] } {
  const peer = recipientPubkey.trim().toLowerCase()
  const sk = typeof senderSecretKey === 'string' ? hexToBytes(senderSecretKey) : senderSecretKey
  const senderPubkey = getPublicKey(sk)
  const rumor = createChatRumor(sk, peer, message)
  const wraps = [createWrap(createSeal(rumor, sk, peer), peer)]
  if (senderPubkey !== peer) {
    wraps.push(createWrap(createSeal(rumor, sk, senderPubkey), senderPubkey))
  }
  return { rumor, wraps }
}

export function unwrapGiftWrap(wrap: Event, recipientSecretKey: string | Uint8Array): Rumor {
  if (wrap.kind !== NIP17_KINDS.giftWrap) {
    throw new Error(`unexpected wrap kind ${wrap.kind}, expected ${NIP17_KINDS.giftWrap}`)
  }
  const seal = decryptJson<Event>(wrap.content, recipientSecretKey, wrap.pubkey)
  if (seal.kind !== NIP17_KINDS.seal) {
    throw new Error(`unexpected seal kind ${seal.kind}, expected ${NIP17_KINDS.seal}`)
  }
  if (!verifyEvent(seal)) {
    throw new Error('seal signature is invalid')
  }
  const rumor = decryptJson<Rumor>(seal.content, recipientSecretKey, seal.pubkey)
  if (rumor.pubkey !== seal.pubkey) {
    throw new Error(`rumor pubkey ${rumor.pubkey} does not match seal pubkey ${seal.pubkey}`)
  }
  if (typeof rumor.id !== 'string' || !rumor.id) {
    throw new Error('rumor missing id')
  }
  return rumor
}

/** Present a rumor as the logical Event used by DM UI (unsigned). */
export function rumorToLogicalEvent(rumor: Rumor): Event {
  return {
    id: rumor.id,
    pubkey: rumor.pubkey,
    created_at: rumor.created_at,
    kind: rumor.kind,
    tags: rumor.tags,
    content: rumor.content,
    sig: '',
  }
}

/** Peer pubkey for a 1:1 kind-14 rumor relative to `me`. */
export function dmPeerFromRumor(rumor: Rumor, me: string): string | null {
  const my = me.toLowerCase()
  if (rumor.pubkey.toLowerCase() === my) {
    const p = rumor.tags.find((t) => t[0] === 'p' && typeof t[1] === 'string')?.[1]
    return p?.toLowerCase() ?? null
  }
  return rumor.pubkey.toLowerCase()
}
