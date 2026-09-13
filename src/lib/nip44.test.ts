import { describe, expect, it } from 'vitest'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { getConversationKey, nip44 } from './nip44'
import { generateSecretKey, getPublicKey } from './nostrPrimitives'
import * as nostrToolsNip44 from 'nostr-tools/nip44'
import { dmPeerFromRumor, rumorToLogicalEvent, unwrapGiftWrap, wrapDirectMessage } from './nip17'

describe('nip44', () => {
  it('matches nostr-tools conversation key + encrypt/decrypt vector', () => {
    const sec1 = '0000000000000000000000000000000000000000000000000000000000000001'
    const sec2 = '0000000000000000000000000000000000000000000000000000000000000002'
    const pub2 = getPublicKey(hexToBytes(sec2))
    const conversationKey = getConversationKey(sec1, pub2)
    expect(bytesToHex(conversationKey)).toBe(
      'c41c775356fd92eadc63ff5a0dc1da211b268cbea22316767095b2871ea1412d',
    )

    const nonce = hexToBytes('0000000000000000000000000000000000000000000000000000000000000001')
    const payload = nip44.v2.encrypt('a', conversationKey, nonce)
    expect(payload).toBe(
      'AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABee0G5VSK0/9YypIObAtDKfYEAjD35uVkHyB0F4DwrcNaCXlCWZKaArsGrY6M9wnuTMxWfp1RTN9Xga8no+kF5Vsb',
    )
    expect(nip44.v2.decrypt(payload, conversationKey)).toBe('a')
  })

  it('roundtrips with nostr-tools ciphertext', () => {
    const skA = generateSecretKey()
    const skB = generateSecretKey()
    const pkB = getPublicKey(skB)
    const msg = 'brezn nip44 interop'
    const ours = nip44.encrypt(skA, pkB, msg)
    const theirsKey = nostrToolsNip44.v2.utils.getConversationKey(skA, pkB)
    expect(nostrToolsNip44.v2.decrypt(ours, theirsKey)).toBe(msg)
    const theirs = nostrToolsNip44.v2.encrypt(msg, theirsKey)
    expect(nip44.decrypt(skB, getPublicKey(skA), theirs)).toBe(msg)
  })
})

describe('nip17', () => {
  it('wraps and unwraps a DM for recipient and sender', () => {
    const skA = generateSecretKey()
    const skB = generateSecretKey()
    const pkA = getPublicKey(skA)
    const pkB = getPublicKey(skB)
    const { rumor, wraps } = wrapDirectMessage(skA, pkB, 'hola')
    expect(wraps).toHaveLength(2)
    expect(wraps.every((w) => w.kind === 1059)).toBe(true)

    const toB = wraps.find((w) => w.tags.some((t) => t[0] === 'p' && t[1] === pkB))
    const toA = wraps.find((w) => w.tags.some((t) => t[0] === 'p' && t[1] === pkA))
    expect(toB).toBeTruthy()
    expect(toA).toBeTruthy()

    const rumorB = unwrapGiftWrap(toB!, skB)
    const rumorA = unwrapGiftWrap(toA!, skA)
    expect(rumorB.content).toBe('hola')
    expect(rumorA.content).toBe('hola')
    expect(rumorB.id).toBe(rumor.id)
    expect(rumorA.id).toBe(rumor.id)
    expect(dmPeerFromRumor(rumorB, pkB)).toBe(pkA)
    expect(dmPeerFromRumor(rumorA, pkA)).toBe(pkB)
    expect(rumorToLogicalEvent(rumorB).kind).toBe(14)
  })
})
