import { describe, expect, it } from 'vitest'
import { generateSecretKey, getPublicKey, nip04, nip44 } from './nostrPrimitives'

describe('nostrPrimitives NIP-04', () => {
  it('roundtrips encrypt/decrypt between two keys', () => {
    const skA = generateSecretKey()
    const skB = generateSecretKey()
    const pkB = getPublicKey(skB)
    const msg = 'hello nip04'
    const enc = nip04.encrypt(skA, pkB, msg)
    const dec = nip04.decrypt(skB, getPublicKey(skA), enc)
    expect(dec).toBe(msg)
  })
})

describe('nostrPrimitives NIP-44 export', () => {
  it('roundtrips via re-exported nip44 helper', () => {
    const skA = generateSecretKey()
    const skB = generateSecretKey()
    const msg = 'hello nip44'
    const enc = nip44.encrypt(skA, getPublicKey(skB), msg)
    expect(nip44.decrypt(skB, getPublicKey(skA), enc)).toBe(msg)
  })
})
