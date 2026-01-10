import { useEffect, useState } from 'react'
import { buttonBase } from '../../lib/buttonStyles'
import type { BreznNostrClient } from '../../lib/nostrClient'
import { DEFAULT_RELAYS } from '../../lib/nostrClient'
import { CloseIcon } from '../CloseIcon'

type RelayStatusLite = {
  url: string
  reachable: boolean | 'unknown'
  lastError?: string
  rttMs?: number
}

type RelayTestState = 'idle' | 'running' | 'error'

type RelaySettingsProps = {
  client: BreznNostrClient
}

function testRelay(url: string, timeoutMs: number): Promise<{ url: string; ok: boolean; rttMs?: number; error?: string }> {
  if (typeof WebSocket === 'undefined') {
    return Promise.resolve({ url, ok: false, error: 'WebSocket not available in this environment.' })
  }
  return new Promise(resolve => {
    const started = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
    let done = false
    let opened = false

    const ws = new WebSocket(url)

    const timer = globalThis.setTimeout(() => {
      if (done) return
      done = true
      try {
        ws.close()
      } catch {
        // ignore
      }
      resolve({ url, ok: false, error: `Timeout after ${timeoutMs}ms` })
    }, timeoutMs)

    const finish = (res: { url: string; ok: boolean; rttMs?: number; error?: string }) => {
      if (done) return
      done = true
      globalThis.clearTimeout(timer)
      resolve(res)
    }

    ws.onopen = () => {
      opened = true
      const ended = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
      const rttMs = Math.max(0, Math.round(ended - started))
      try {
        ws.close(1000, 'brezn-test')
      } catch {
        // ignore
      }
      finish({ url, ok: true, rttMs })
    }

    ws.onerror = () => {
      finish({ url, ok: false, error: 'WebSocket error' })
    }

    ws.onclose = ev => {
      // If it closed before open and without a prior onerror, treat as failure.
      if (done) return
      if (opened) return
      const err = ev.reason || `Closed (${ev.code})`
      finish({ url, ok: false, error: err })
    }
  })
}

function asErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return String(e)
}

export function RelaySettings({ client }: RelaySettingsProps) {
  const [relays, setRelays] = useState<string[]>(() => client.getRelays())
  const [newRelay, setNewRelay] = useState('')
  const [relayMsg, setRelayMsg] = useState<string | null>(null)
  const [relayStatusesByUrl, setRelayStatusesByUrl] = useState<Record<string, RelayStatusLite>>({})
  const [relayTestState, setRelayTestState] = useState<RelayTestState>('idle')
  const [relayTestError, setRelayTestError] = useState<string | null>(null)
  const [relayTestTriggered, setRelayTestTriggered] = useState(false)

  // Keep relay status list in sync with current enabled relays.
  useEffect(() => {
    setRelayStatusesByUrl(prev => {
      const next: Record<string, RelayStatusLite> = {}
      for (const url of relays) {
        next[url] = prev[url] ?? { url, reachable: 'unknown' }
      }
      return next
    })
  }, [relays])

  async function runRelayTests() {
    setRelayTestTriggered(true)
    setRelayTestState('running')
    setRelayTestError(null)

    const urls = relays
    const timeoutMs = 3500

    // Pre-fill unknown for all current relays.
    setRelayStatusesByUrl(prev => {
      const next = { ...prev }
      for (const url of urls) next[url] = next[url] ?? { url, reachable: 'unknown' }
      return next
    })

    try {
      await Promise.all(
        urls.map(async url => {
          const r = await testRelay(url, timeoutMs)
          setRelayStatusesByUrl(prev => ({
            ...prev,
            [url]: r.ok
              ? { url, reachable: true, rttMs: r.rttMs, lastError: undefined }
              : { url, reachable: false, rttMs: undefined, lastError: r.error ?? 'Unreachable' },
          }))
        }),
      )
      setRelayTestState('idle')
    } catch (e) {
      setRelayTestState('error')
      setRelayTestError(asErrorMessage(e))
    }
  }

  return (
    <div className="p-3">
      <div className="text-xs font-semibold text-brezn-muted">Relays</div>
      <div className="mt-1 text-xs text-brezn-muted">Relays for loading & posting.</div>

      {relays.length === 0 ? (
        <div className="mt-3 rounded-xl border border-brezn-border bg-brezn-panel2 p-3 text-xs text-brezn-muted">
          No relays configured. Posts cannot be loaded or published without at least one relay. Add a relay below or use the "Default" button to restore default relays.
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {relays.map(r => {
          return (
            <div
              key={r}
              className="flex items-center justify-between gap-2 rounded-xl border border-brezn-border bg-brezn-panel p-2"
            >
              <span className="min-w-0 truncate font-mono text-xs">{r}</span>
              <button
                type="button"
                onClick={e => {
                  e.preventDefault()
                  const next = relays.filter(x => x !== r)
                  client.setRelays(next)
                  setRelays(next)
                  setRelayMsg('Relay removed.')
                }}
                className="shrink-0 hover:opacity-80 focus:outline-none"
                aria-label="Remove relay"
              >
                <CloseIcon />
              </button>
            </div>
          )
        })}
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={e => {
          e.preventDefault()
          const t = newRelay.trim()
          if (!t) return
          const next = [...relays, t]
          client.setRelays(next)
          setRelays(client.getRelays())
          setNewRelay('')
          setRelayMsg('Relay added.')
          setRelayTestTriggered(false)
        }}
      >
        <input
          value={newRelay}
          onChange={e => setNewRelay(e.target.value)}
          placeholder="wss://relay.example"
          className="w-full border border-brezn-border bg-brezn-panel p-2 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={!newRelay.trim()}
          className={`rounded-xl px-3 py-2 text-xs font-semibold ${buttonBase}`}
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => {
            client.setRelays([...DEFAULT_RELAYS])
            setRelays(client.getRelays())
            setRelayMsg('Reset to default relays.')
            setRelayTestTriggered(false)
          }}
          className={`shrink-0 rounded-xl px-3 py-2 text-xs ${buttonBase}`}
        >
          Default
        </button>
        <button
          type="button"
          onClick={() => void runRelayTests()}
          disabled={relayTestState === 'running' || relays.length === 0}
          className={`shrink-0 rounded-xl px-3 py-2 text-xs ${buttonBase}`}
        >
          {relayTestState === 'running' ? 'Testing…' : 'Test'}
        </button>
      </form>

      {relayMsg ? <div className="mt-2 text-xs text-brezn-muted">{relayMsg}</div> : null}

      {relayTestState === 'error' && relayTestError ? <div className="mt-2 text-xs text-brezn-danger">{relayTestError}</div> : null}

      {relayTestTriggered ? (
        <div className="mt-3 space-y-2">
          {relays.map(url => {
            const s = relayStatusesByUrl[url] ?? { url, reachable: 'unknown' as const }
            return (
              <div key={url} className="flex items-center justify-between gap-2 rounded-xl border border-brezn-border bg-brezn-panel p-2">
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs">{url}</div>
                  <div className="truncate text-[11px] text-brezn-muted">
                    {s.reachable === 'unknown'
                      ? 'unknown'
                      : s.reachable
                        ? `reachable${typeof s.rttMs === 'number' ? ` • ${s.rttMs}ms` : ''}`
                        : `unreachable${s.lastError ? ` • ${s.lastError}` : ''}`}
                  </div>
                </div>
                <div
                  className={[
                    'h-2.5 w-2.5 shrink-0 rounded-full',
                    s.reachable === 'unknown' ? 'bg-brezn-muted/50' : s.reachable ? 'bg-emerald-400' : 'bg-brezn-danger',
                  ].join(' ')}
                  aria-label={`Relay status: ${s.reachable === 'unknown' ? 'unknown' : s.reachable ? 'reachable' : 'unreachable'}`}
                />
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

