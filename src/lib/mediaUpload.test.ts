// @vitest-environment node
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createNip98AuthHeader,
  extractUrlFromUploadResponse,
  probeMediaUploadEndpoint,
  toNip96WellKnownUrl,
} from './mediaUpload'

describe('extractUrlFromUploadResponse', () => {
  test('finds top-level url', () => {
    expect(extractUrlFromUploadResponse({ url: 'https://img.example/a.png' })).toBe(
      'https://img.example/a.png',
    )
  })

  test('finds nested url under data', () => {
    expect(extractUrlFromUploadResponse({ data: { url: 'https://img.example/b.jpg' } })).toBe(
      'https://img.example/b.jpg',
    )
  })

  test('finds url in arrays', () => {
    expect(extractUrlFromUploadResponse({ data: [{ url: 'https://img.example/c.webp' }] })).toBe(
      'https://img.example/c.webp',
    )
  })

  test('finds url inside string', () => {
    expect(extractUrlFromUploadResponse('ok: https://img.example/d.png')).toBe(
      'https://img.example/d.png',
    )
  })
})

describe('toNip96WellKnownUrl', () => {
  test('builds well-known URL from origin', () => {
    expect(toNip96WellKnownUrl('https://example.org')).toBe(
      'https://example.org/.well-known/nostr/nip96.json',
    )
    expect(toNip96WellKnownUrl('https://example.org/anything/here')).toBe(
      'https://example.org/.well-known/nostr/nip96.json',
    )
  })
})

describe('createNip98AuthHeader', () => {
  test('creates a Nostr authorization header with kind 27235', async () => {
    const h = await createNip98AuthHeader({ url: 'https://example.com/upload', method: 'POST' })
    expect(h.startsWith('Nostr ')).toBe(true)
    const b64 = h.slice('Nostr '.length)
    const json = Buffer.from(b64, 'base64').toString('utf8')
    const evt = JSON.parse(json) as { kind: number; tags: string[][] }
    expect(evt.kind).toBe(27235)
    expect(evt.tags.some((t) => t[0] === 'u' && t[1] === 'https://example.com/upload')).toBe(true)
    expect(evt.tags.some((t) => t[0] === 'method' && t[1] === 'POST')).toBe(true)
  })
})

describe('probeMediaUploadEndpoint', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('returns not configured for empty input', async () => {
    const r = await probeMediaUploadEndpoint('  ')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('Not configured')
  })

  test('discovers NIP-96 base URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        expect(url).toBe('https://upload.example/.well-known/nostr/nip96.json')
        return {
          ok: true,
          status: 200,
          json: async () => ({ api_url: 'https://upload.example/api' }),
        }
      }),
    )
    const r = await probeMediaUploadEndpoint('https://upload.example')
    expect(r.ok).toBe(true)
    expect(r.apiUrl).toBe('https://upload.example/api')
    expect(typeof r.rttMs).toBe('number')
  })

  test('probes direct upload URL with auth-required response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'HEAD') {
          return { ok: false, status: 401 }
        }
        return { ok: false, status: 401 }
      }),
    )
    const r = await probeMediaUploadEndpoint('https://upload.example/direct')
    expect(r.ok).toBe(true)
    expect(r.apiUrl).toBe('https://upload.example/direct')
  })

  test('fails when direct URL returns 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 })),
    )
    const r = await probeMediaUploadEndpoint('https://upload.example/missing')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('404')
  })
})
