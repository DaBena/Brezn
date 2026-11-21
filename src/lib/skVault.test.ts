import { describe, expect, it } from 'vitest'
import {
  isDeviceWrappedSk,
  isLegacyPlainSkHex,
  isPasswordWrappedSk,
  openPasswordSession,
  rewrapSkWithSession,
  unwrapSkWithPassword,
  wrapSkWithPassword,
} from './skVault'
import { aesGcmDecryptText, aesGcmEncryptText, randomAesKeyBytes } from './aesGcm'

const SAMPLE_SK = 'a'.repeat(64)

describe('skVault', () => {
  it('detects encodings', () => {
    expect(isLegacyPlainSkHex(SAMPLE_SK)).toBe(true)
    expect(isPasswordWrappedSk('v2:pbkdf2:310000:a:b:c')).toBe(true)
    expect(isDeviceWrappedSk('abc:def')).toBe(true)
    expect(isDeviceWrappedSk('v2:pbkdf2:1:2:3:4')).toBe(false)
  })

  it('wraps and unwraps with password', async () => {
    const wrapped = await wrapSkWithPassword(SAMPLE_SK, 'correct-horse')
    expect(isPasswordWrappedSk(wrapped)).toBe(true)
    expect(wrapped.includes(SAMPLE_SK)).toBe(false)
    const plain = await unwrapSkWithPassword(wrapped, 'correct-horse')
    expect(plain).toBe(SAMPLE_SK)
  })

  it('rejects wrong password', async () => {
    const wrapped = await wrapSkWithPassword(SAMPLE_SK, 'correct-horse')
    await expect(unwrapSkWithPassword(wrapped, 'wrong-password')).rejects.toThrow()
  })

  it('rejects short passwords on wrap', async () => {
    await expect(wrapSkWithPassword(SAMPLE_SK, 'short')).rejects.toThrow(/at least 8/)
  })

  it('session rewrap roundtrip', async () => {
    const wrapped = await wrapSkWithPassword(SAMPLE_SK, 'correct-horse')
    const session = await openPasswordSession(wrapped, 'correct-horse')
    const again = await rewrapSkWithSession(session)
    expect(isPasswordWrappedSk(again)).toBe(true)
    expect(await unwrapSkWithPassword(again, 'correct-horse')).toBe(SAMPLE_SK)
  })
})

describe('aesGcm', () => {
  it('encrypts without storing plaintext', async () => {
    const key = randomAesKeyBytes()
    const packed = await aesGcmEncryptText(key, SAMPLE_SK)
    expect(packed.includes(SAMPLE_SK)).toBe(false)
    expect(packed.includes(':')).toBe(true)
    expect(await aesGcmDecryptText(key, packed)).toBe(SAMPLE_SK)
  })

  it('rejects a ciphertext under the wrong key', async () => {
    const packed = await aesGcmEncryptText(randomAesKeyBytes(), SAMPLE_SK)
    await expect(aesGcmDecryptText(randomAesKeyBytes(), packed)).rejects.toThrow()
  })
})
