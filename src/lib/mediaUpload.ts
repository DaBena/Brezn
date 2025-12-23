import { extractUrls } from './urls'
import { hexToBytes } from '@noble/hashes/utils'
import { finalizeEvent, generateSecretKey } from 'nostr-tools/pure'

export type UploadResult = { url: string }

// Default NIP-96 server base URL (app will discover the actual upload URL via /.well-known/nostr/nip96.json).
export const DEFAULT_NIP96_SERVER = 'https://nostrcheck.me'

function firstStringUrlInObject(x: unknown): string | null {
  if (!x) return null
  if (typeof x === 'string') {
    const trimmed = x.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
    // Sometimes APIs return a string containing a URL (e.g. "ok: https://...").
    const urls = extractUrls(trimmed).map(u => u.url)
    return urls[0] ?? null
  }
  if (Array.isArray(x)) {
    for (const v of x) {
      const got = firstStringUrlInObject(v)
      if (got) return got
    }
    return null
  }
  if (typeof x === 'object') {
    const obj = x as Record<string, unknown>
    // Common keys.
    for (const key of [
      'url',
      'URL',
      'link',
      'download_url',
      'downloadUrl',
      'file',
      'location',
      'tags',
      // NIP-96 often returns a NIP-94 event with a ["url", "..."] tag.
      'nip94_event',
      'nip94Event',
      'nip94',
    ]) {
      const got = firstStringUrlInObject(obj[key])
      if (got) return got
    }
    // NIP-96 servers often wrap results in `data`.
    if ('data' in obj) {
      const got = firstStringUrlInObject(obj.data)
      if (got) return got
    }
  }
  return null
}

export function extractUrlFromUploadResponse(body: unknown): string | null {
  return firstStringUrlInObject(body)
}

type Nip96Discovery = {
  api_url?: string
  download_url?: string
  supported_nips?: unknown
  plans?: Record<string, { is_nip98_required?: boolean }>
}

function toBase64(text: string): string {
  // Browser + Node.
  if (typeof btoa === 'function') return btoa(text)
  // Node fallback (avoid hard dependency on Buffer types in the app tsconfig).
  const BufferCtor = (globalThis as unknown as { Buffer?: { from: (input: string, enc: string) => { toString: (enc: string) => string } } })
    .Buffer
  if (BufferCtor) return BufferCtor.from(text, 'utf8').toString('base64')
  throw new Error('Base64 encoding not available in this environment.')
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

function normalizeHttpUrl(input: string): URL {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Media upload endpoint is not configured.')
  if (!/^https?:\/\//i.test(trimmed)) throw new Error('Media upload endpoint must start with http(s)://')
  return new URL(trimmed)
}

function isLikelyServerBaseUrl(u: URL): boolean {
  const p = u.pathname.replace(/\/+$/, '')
  return p === '' || p === '/'
}

export function toNip96WellKnownUrl(serverBase: string): string {
  const u = normalizeHttpUrl(serverBase)
  // Ensure we ignore any path and always go to origin.
  return `${u.origin}/.well-known/nostr/nip96.json`
}

export async function discoverNip96(serverBase: string, opts?: { signal?: AbortSignal }): Promise<{
  apiUrl: string
  requiresNip98: boolean
  raw: Nip96Discovery
}> {
  const wellKnown = toNip96WellKnownUrl(serverBase)
  const res = await fetch(wellKnown, { method: 'GET', signal: opts?.signal })
  const payload = (await res.json().catch(() => null)) as unknown
  if (!res.ok || !payload || typeof payload !== 'object') {
    throw new Error(`NIP-96 discovery failed (${res.status}).`)
  }

  const data = payload as Nip96Discovery
  const apiUrl = typeof data.api_url === 'string' ? data.api_url.trim() : ''
  if (!apiUrl || !/^https?:\/\//i.test(apiUrl)) throw new Error('NIP-96 discovery returned no api_url.')

  const plans = data.plans && typeof data.plans === 'object' ? Object.values(data.plans) : []
  const requiresNip98 = plans.some(p => Boolean(p?.is_nip98_required))
  return { apiUrl, requiresNip98, raw: data }
}

export function createNip98AuthHeader(opts: { url: string; method: string; skHex?: string }): string {
  // NIP-98: Authorization: Nostr <base64(JSON(event))>
  // We intentionally omit the optional "payload" tag because for multipart bodies
  // browsers generate the boundary internally, making stable hashing impractical here.
  const skHex = opts.skHex?.trim()
  const skBytes = skHex ? hexToBytes(skHex) : generateSecretKey()
  const evt = finalizeEvent(
    {
      kind: 27235,
      created_at: nowSec(),
      tags: [
        ['u', opts.url],
        ['method', opts.method.toUpperCase()],
      ],
      content: '',
    },
    skBytes,
  )
  return `Nostr ${toBase64(JSON.stringify(evt))}`
}

async function resolveUploadEndpoint(input: string, opts?: { signal?: AbortSignal }): Promise<{ url: string; requiresNip98: boolean }> {
  const u = normalizeHttpUrl(input)

  // Allow user to paste the well-known URL directly.
  const normalizedPath = u.pathname.replace(/\/+$/, '')
  const isWellKnown = normalizedPath === '/.well-known/nostr/nip96.json'
  if (isWellKnown) {
    const res = await fetch(u.toString(), { method: 'GET', signal: opts?.signal })
    const payload = (await res.json().catch(() => null)) as unknown
    if (!res.ok || !payload || typeof payload !== 'object') {
      throw new Error(`NIP-96 discovery failed (${res.status}).`)
    }
    const data = payload as Nip96Discovery
    const apiUrl = typeof data.api_url === 'string' ? data.api_url.trim() : ''
    if (!apiUrl || !/^https?:\/\//i.test(apiUrl)) throw new Error('NIP-96 discovery returned no api_url.')
    const plans = data.plans && typeof data.plans === 'object' ? Object.values(data.plans) : []
    const requiresNip98 = plans.some(p => Boolean(p?.is_nip98_required))
    return { url: apiUrl, requiresNip98 }
  }

  // If only a server base is provided, use discovery.
  if (isLikelyServerBaseUrl(u)) {
    const { apiUrl, requiresNip98 } = await discoverNip96(u.origin, { signal: opts?.signal })
    return { url: apiUrl, requiresNip98 }
  }

  // Otherwise treat as a direct upload endpoint.
  return { url: u.toString(), requiresNip98: false }
}

export async function uploadMediaFile(opts: {
  endpoint: string
  file: File
  signal?: AbortSignal
  nip98?: { skHex?: string }
}): Promise<UploadResult> {
  const resolved = await resolveUploadEndpoint(opts.endpoint, { signal: opts.signal })

  const fd = new FormData()
  fd.set('file', opts.file)

  async function postUpload(authHeader?: string): Promise<{ res: Response; payload: unknown }> {
    const headers: Record<string, string> = {}
    if (authHeader) headers.authorization = authHeader
    const res = await fetch(resolved.url, { method: 'POST', body: fd, signal: opts.signal, headers })
    const ct = res.headers.get('content-type') ?? ''
    const payload: unknown = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text().catch(() => '')
    return { res, payload }
  }

  const initialAuth = resolved.requiresNip98
    ? createNip98AuthHeader({ url: resolved.url, method: 'POST', skHex: opts.nip98?.skHex })
    : undefined

  let { res, payload } = await postUpload(initialAuth)

  // If the user pasted a direct upload URL (no discovery), some servers require NIP-98 and return 401/403.
  if (!res.ok && !initialAuth && (res.status === 401 || res.status === 403)) {
    const retryAuth = createNip98AuthHeader({ url: resolved.url, method: 'POST', skHex: opts.nip98?.skHex })
    ;({ res, payload } = await postUpload(retryAuth))
  }

  if (!res.ok) {
    const hint =
      typeof payload === 'string'
        ? payload.slice(0, 200)
        : payload && typeof payload === 'object'
          ? JSON.stringify(payload).slice(0, 200)
          : ''
    throw new Error(`Upload failed (${res.status}). ${hint}`.trim())
  }

  const url = extractUrlFromUploadResponse(payload)
  if (!url) throw new Error('Upload succeeded but no URL was found in the response.')
  return { url }
}

// Backwards compatible wrapper (older UI label was "Bild").
export async function uploadImageFile(opts: {
  endpoint: string
  file: File
  signal?: AbortSignal
  nip98?: { skHex?: string }
}): Promise<UploadResult> {
  return uploadMediaFile(opts)
}

