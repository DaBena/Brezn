import { finalizeEvent, generateSecretKey } from 'nostr-tools/pure'

const DEFAULT_SERVER = process.env.MEDIA_SERVER?.trim() || 'https://nostrcheck.me'
const FIXTURE = process.env.MEDIA_FILE?.trim() || null

// 1x1 transparent PNG (base64). Used when MEDIA_FILE is not set.
const DEFAULT_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Ww0kAAAAASUVORK5CYII='

function nowSec() {
  return Math.floor(Date.now() / 1000)
}

function toBase64(text) {
  return Buffer.from(text, 'utf8').toString('base64')
}

function toNip96WellKnownUrl(serverBase) {
  const u = new URL(serverBase)
  return `${u.origin}/.well-known/nostr/nip96.json`
}

async function discoverNip96(serverBase) {
  const wellKnown = toNip96WellKnownUrl(serverBase)
  const res = await fetch(wellKnown)
  const body = await res.json().catch(() => null)
  if (!res.ok || !body || typeof body !== 'object') throw new Error(`NIP-96 discovery failed (${res.status})`)

  const apiUrl = typeof body.api_url === 'string' ? body.api_url.trim() : ''
  if (!apiUrl) throw new Error('NIP-96 discovery returned no api_url')

  const plans = body.plans && typeof body.plans === 'object' ? Object.values(body.plans) : []
  const requiresNip98 = plans.some(p => Boolean(p?.is_nip98_required))
  return { apiUrl, requiresNip98, wellKnown, raw: body }
}

function createNip98AuthHeader({ url, method }) {
  const evt = finalizeEvent(
    {
      kind: 27235,
      created_at: nowSec(),
      tags: [
        ['u', url],
        ['method', method.toUpperCase()],
      ],
      content: '',
    },
    generateSecretKey(),
  )
  return `Nostr ${toBase64(JSON.stringify(evt))}`
}

function firstStringUrlInObject(x) {
  if (!x) return null
  if (typeof x === 'string') {
    const t = x.trim()
    const m = t.match(/https?:\/\/\S+/)
    return m ? m[0] : null
  }
  if (Array.isArray(x)) {
    for (const v of x) {
      const got = firstStringUrlInObject(v)
      if (got) return got
    }
    return null
  }
  if (typeof x === 'object') {
    for (const k of [
      'url',
      'URL',
      'link',
      'download_url',
      'downloadUrl',
      'file',
      'location',
      'tags',
      'nip94_event',
      'nip94Event',
      'nip94',
    ]) {
      const got = firstStringUrlInObject(x[k])
      if (got) return got
    }
    if ('data' in x) return firstStringUrlInObject(x.data)
  }
  return null
}

async function main() {
  const { apiUrl, requiresNip98, wellKnown } = await discoverNip96(DEFAULT_SERVER)
  let file
  if (FIXTURE) {
    const { readFile } = await import('node:fs/promises')
    const buf = await readFile(FIXTURE)
    file = new File([buf], FIXTURE.split('/').pop() || 'upload.bin', { type: 'application/octet-stream' })
  } else {
    const buf = Buffer.from(DEFAULT_PNG_BASE64, 'base64')
    file = new File([buf], 'test.png', { type: 'image/png' })
  }
  const fd = new FormData()
  fd.set('file', file)

  const headers = {}
  if (requiresNip98) headers.Authorization = createNip98AuthHeader({ url: apiUrl, method: 'POST' })

  const res = await fetch(apiUrl, { method: 'POST', body: fd, headers })
  const ct = res.headers.get('content-type') ?? ''
  const payload = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text().catch(() => '')

  if (!res.ok) {
    const hint = typeof payload === 'string' ? payload.slice(0, 400) : JSON.stringify(payload).slice(0, 400)
    throw new Error(`Upload failed (${res.status}). ${hint}`.trim())
  }

  const url = firstStringUrlInObject(payload)
  if (!url) throw new Error('Upload succeeded but no URL was found in the response.')

  console.log('NIP-96 well-known:', wellKnown)
  console.log('Upload URL:', apiUrl)
  console.log('NIP-98 required:', requiresNip98)
  console.log('Result URL:', url)
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})

