import { describe, expect, it } from 'vitest'
import { generateSecretKey, getPublicKey, nip04 } from './nostrPrimitives'

describe('nostrPrimitives NIP-04', () => {
  it('roundtrips encrypt/decrypt between two keys', () => {
    const skA = generateSecretKey()
    const skB = generateSecretKey()
    const pkA = getPublicKey(skA)
    const pkB = getPublicKey(skB)
    const msg = 'hello nip04'
    const enc = nip04.encrypt(skA, pkB, msg)
    const dec = nip04.decrypt(skB, pkA, enc)
    expect(dec).toBe(msg)
  })
})
