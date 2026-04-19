// @vitest-environment node
// Opt-in: RELAY_PROBE=1 npm test -- relayCatalog.integration
// Env: RELAY_PROBE_LIMIT, RELAY_PROBE_EOSE_MS, RELAY_PROBE_CONCURRENCY, RELAY_PROBE_OUT

import { writeFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { Relay } from 'nostr-tools/relay'
import type { Filter } from 'nostr-tools'
import { DEFAULT_RELAYS } from './nostrClient'

const GEOHASH_U_FILTER: Filter[] = [{ kinds: [1], '#g': ['u'], limit: 5 }]

const RELAY_LIST_SOURCES: readonly { url: string; kind: 'json' | 'lines' | 'csv' }[] = [
  { url: 'https://nostr.watch/relays.json', kind: 'json' },
  {
    url: 'https://raw.githubusercontent.com/sesseor/nostr-relays-list/main/relays.txt',
    kind: 'lines',
  },
  {
    url: 'https://raw.githubusercontent.com/permissionlesstech/georelays/main/nostr_relays.csv',
    kind: 'csv',
  },
] as const

function normalizeRelayUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    const u = new URL(trimmed)
    if (u.protocol !== 'wss:' && u.protocol !== 'ws:') return null
    u.hash = ''
    u.search = ''
    const s = u.toString()
    return s.endsWith('/') ? s.slice(0, -1) : s
  } catch {
    return null
  }
}

function dedupeRelays(urls: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const r of urls) {
    const norm = normalizeRelayUrl(r)
    if (!norm) continue
    const key = norm.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(norm)
  }
  return out
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'follow' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(t)
  }
}

function parseRelayLines(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^wss?:\/\//i.test(l))
}

function parseRelayJson(body: string): string[] {
  const data: unknown = JSON.parse(body)
  if (Array.isArray(data)) {
    const urls: string[] = []
    for (const item of data) {
      if (typeof item === 'string') urls.push(item)
      else if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>
        const u = o.url ?? o.wss ?? o.relay ?? o.uri
        if (typeof u === 'string') urls.push(u)
      }
    }
    return urls
  }
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    const relays = o.relays
    if (Array.isArray(relays)) return parseRelayJson(JSON.stringify(relays))
  }
  return []
}

function cellToRelayUrl(cell: string): string | null {
  const c = cell.trim().replace(/^"|"$/g, '')
  if (!c) return null
  if (/^wss?:\/\//i.test(c)) return c
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(c)) return `wss://${c}`
  return null
}

function parseRelayCsvFirstColumn(body: string): string[] {
  const lines = body.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const urls: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (i === 0 && /^\s*relay/i.test(line)) continue
    const u = cellToRelayUrl(line.split(',')[0] ?? '')
    if (u) urls.push(u)
  }
  return urls
}

async function fetchRelayCatalog(
  timeoutMs = 25_000,
): Promise<{ urls: string[]; source: string | null }> {
  for (const src of RELAY_LIST_SOURCES) {
    try {
      const body = await fetchText(src.url, timeoutMs)
      if (src.kind === 'lines') {
        const urls = parseRelayLines(body)
        if (urls.length > 0) return { urls: dedupeRelays(urls), source: src.url }
      } else if (src.kind === 'csv') {
        const urls = parseRelayCsvFirstColumn(body)
        if (urls.length > 0) return { urls: dedupeRelays(urls), source: src.url }
      } else {
        const trimmed = body.trim()
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          const urls = dedupeRelays(parseRelayJson(trimmed))
          if (urls.length > 0) return { urls, source: src.url }
        }
      }
    } catch {
      continue
    }
  }
  return { urls: [], source: null }
}

type ProbeRow = { url: string; ok: boolean; gotEvent: boolean; error?: string }

async function probeGeohashU(url: string, eoseTimeoutMs: number): Promise<ProbeRow> {
  let relay: Relay | undefined
  try {
    relay = await Relay.connect(url, { enablePing: true, enableReconnect: false })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { url, ok: false, gotEvent: false, error: `connect: ${msg}` }
  }

  return await new Promise((resolve) => {
    let settled = false
    const finish = (partial: Omit<ProbeRow, 'url'>) => {
      if (settled) return
      settled = true
      try {
        relay?.close()
      } catch {
        /* ignore */
      }
      resolve({ url, ...partial })
    }

    relay!.subscribe(GEOHASH_U_FILTER, {
      eoseTimeout: eoseTimeoutMs,
      oneose: () => finish({ ok: true, gotEvent: false }),
      onevent: () => finish({ ok: true, gotEvent: true }),
      onclose: (reason) =>
        finish({ ok: false, gotEvent: false, error: `subscription closed: ${reason}` }),
    })
  })
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (true) {
      const idx = next++
      if (idx >= items.length) break
      results[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

const runProbe = process.env.RELAY_PROBE === '1' || process.env.RELAY_PROBE === 'true'

describe.skipIf(!runProbe)('relay catalog + #g=u (RELAY_PROBE=1)', () => {
  it('fetch catalog, probe #g=u, write relays-geohash-u.txt', async () => {
    const limit = Math.max(5, Math.min(80, Number(process.env.RELAY_PROBE_LIMIT) || 20))
    const perRelayMs = Math.max(
      5000,
      Math.min(45_000, Number(process.env.RELAY_PROBE_EOSE_MS) || 14_000),
    )
    const concurrency = Math.max(1, Math.min(12, Number(process.env.RELAY_PROBE_CONCURRENCY) || 6))

    const catalog = await fetchRelayCatalog()
    expect(catalog.source, 'relay catalog fetch').toBeTruthy()
    expect(catalog.urls.length).toBeGreaterThan(10)

    const pool = dedupeRelays([...DEFAULT_RELAYS, ...catalog.urls])
    const head = pool.slice(0, limit)
    const rows = await mapWithConcurrency(head, concurrency, (url) =>
      probeGeohashU(url, perRelayMs),
    )

    const ok = rows.filter((r) => r.ok)
    const defaults = DEFAULT_RELAYS.map((d) => rows.find((r) => r.url === d)).filter(
      Boolean,
    ) as ProbeRow[]

    console.info(
      `[relay-probe] catalog=${catalog.source} sampled=${head.length}/${pool.length} ok=${ok.length} EVENT=${ok.filter((r) => r.gotEvent).length}`,
    )
    for (const r of rows) {
      console.info(
        `[relay-probe] ${!r.ok ? 'FAIL' : r.gotEvent ? 'OK+EVENT' : 'OK+EOSE'} ${r.url}${r.error ? ` — ${r.error}` : ''}`,
      )
    }

    const outRel =
      process.env.RELAY_PROBE_OUT?.trim() || join(process.cwd(), 'relays-geohash-u.txt')
    const withUEvent = rows.filter((r) => r.ok && r.gotEvent)
    writeFileSync(
      outRel,
      [
        '# kind-1 EVENT for #g=["u"] (Brezn relay probe)',
        `# ${new Date().toISOString()} catalog=${catalog.source} sampled=${head.length}`,
        '',
        ...withUEvent.map((r) => r.url),
        ...(withUEvent.length === 0 ? ['# (none — try higher RELAY_PROBE_LIMIT)'] : []),
        '',
      ].join('\n'),
      'utf8',
    )
    console.info(`[relay-probe] wrote ${withUEvent.length} → ${outRel}`)

    expect(ok.length).toBeGreaterThan(0)
    const defaultOk = defaults.filter((r) => r.ok).length
    expect(
      defaultOk,
      `DEFAULT_RELAYS ok ${defaultOk}/${DEFAULT_RELAYS.length}: ` +
        defaults.map((d) => `${d.url}(${d.ok ? 'ok' : d.error})`).join(', '),
    ).toBeGreaterThanOrEqual(Math.min(DEFAULT_RELAYS.length, 2))
  }, 240_000)
})
