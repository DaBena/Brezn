import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseSupportedNips,
  relayToNip11HttpUrl,
  relaysSupportingNip,
  resetNip11Cache,
} from './nip11'

describe('relayToNip11HttpUrl', () => {
  it('maps wss to https', () => {
    expect(relayToNip11HttpUrl('wss://relay.example/')).toBe('https://relay.example/')
  })

  it('maps ws to http', () => {
    expect(relayToNip11HttpUrl('ws://localhost:7777')).toBe('http://localhost:7777/')
  })

  it('rejects non-websocket URLs', () => {
    expect(relayToNip11HttpUrl('https://relay.example')).toBeNull()
  })
})

describe('parseSupportedNips', () => {
  it('reads integer and numeric-string entries', () => {
    expect(
      [...parseSupportedNips({ supported_nips: [1, '50', 42] })].sort((a, b) => a - b),
    ).toEqual([1, 42, 50])
  })

  it('is empty for junk', () => {
    expect(parseSupportedNips(null).size).toBe(0)
    expect(parseSupportedNips({}).size).toBe(0)
  })
})

describe('relaysSupportingNip', () => {
  afterEach(() => {
    resetNip11Cache()
    vi.unstubAllGlobals()
  })

  it('keeps only relays that advertise the nip', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('search.example')) {
          return new Response(JSON.stringify({ supported_nips: [1, 50] }), { status: 200 })
        }
        return new Response(JSON.stringify({ supported_nips: [1, 11] }), { status: 200 })
      }),
    )
    const out = await relaysSupportingNip(['wss://search.example', 'wss://home.example'], 50)
    expect(out).toEqual(['wss://search.example'])
  })

  it('skips relays whose NIP-11 fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network')
      }),
    )
    await expect(relaysSupportingNip(['wss://dead.example'], 50)).resolves.toEqual([])
  })
})
