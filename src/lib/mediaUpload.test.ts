// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { createNip98AuthHeader, extractUrlFromUploadResponse, toNip96WellKnownUrl } from './mediaUpload'

describe('extractUrlFromUploadResponse', () => {
  test('finds top-level url', () => {
    expect(extractUrlFromUploadResponse({ url: 'https://img.example/a.png' })).toBe('https://img.example/a.png')
  })

  test('finds nested url under data', () => {
    expect(extractUrlFromUploadResponse({ data: { url: 'https://img.example/b.jpg' } })).toBe('https://img.example/b.jpg')
  })

  test('finds url in arrays', () => {
    expect(extractUrlFromUploadResponse({ data: [{ url: 'https://img.example/c.webp' }] })).toBe('https://img.example/c.webp')
  })

  test('finds url inside string', () => {
    expect(extractUrlFromUploadResponse('ok: https://img.example/d.png')).toBe('https://img.example/d.png')
  })
})

describe('toNip96WellKnownUrl', () => {
  test('builds well-known URL from origin', () => {
    expect(toNip96WellKnownUrl('https://nostr.build')).toBe('https://nostr.build/.well-known/nostr/nip96.json')
    expect(toNip96WellKnownUrl('https://nostr.build/anything/here')).toBe('https://nostr.build/.well-known/nostr/nip96.json')
  })
})

describe('createNip98AuthHeader', () => {
  test('creates a Nostr authorization header with kind 27235', () => {
    const h = createNip98AuthHeader({ url: 'https://example.com/upload', method: 'POST' })
    expect(h.startsWith('Nostr ')).toBe(true)
    const b64 = h.slice('Nostr '.length)
    const json = Buffer.from(b64, 'base64').toString('utf8')
    const evt = JSON.parse(json) as { kind: number; tags: string[][] }
    expect(evt.kind).toBe(27235)
    expect(evt.tags.some(t => t[0] === 'u' && t[1] === 'https://example.com/upload')).toBe(true)
    expect(evt.tags.some(t => t[0] === 'method' && t[1] === 'POST')).toBe(true)
  })
})

