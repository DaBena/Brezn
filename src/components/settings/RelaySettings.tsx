import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buttonBase } from '../../lib/buttonStyles'
import { cn } from '../../lib/cn'
import type { BreznNostrClient } from '../../lib/nostrClient'
import { DEFAULT_RELAYS } from '../../lib/nostrClient'
import { RELAY_WEBSOCKET_TEST_TIMEOUT_MS } from '../../lib/constants'
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

function testRelay(
  url: string,
  timeoutMs: number,
): Promise<{ url: string; ok: boolean; rttMs?: number; error?: string }> {
  if (typeof WebSocket === 'undefined') {
    return Promise.resolve({
      url,
      ok: false,
      error: 'WebSocket not available in this environment.',
    })
  }
  return new Promise((resolve) => {
    const started =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()
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
      const ended =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now()
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

    ws.onclose = (ev) => {
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
  const { t } = useTranslation()
  const [relaysUi, setRelaysUi] = useState<string[]>(() => client.getRelays())
  const [newRelay, setNewRelay] = useState('')
  const [relayTestResults, setRelayTestResults] = useState<Record<string, RelayStatusLite>>({})
  const [relayTestState, setRelayTestState] = useState<RelayTestState>('idle')
  const [relayTestError, setRelayTestError] = useState<string | null>(null)
  const [relayTestTriggered, setRelayTestTriggered] = useState(false)

  useEffect(() => {
    setRelaysUi(client.getRelays())
  }, [client])

  const relayStatusesByUrl = useMemo(() => {
    const next: Record<string, RelayStatusLite> = {}
    for (const url of relaysUi) {
      next[url] = relayTestResults[url] ?? { url, reachable: 'unknown' }
    }
    return next
  }, [relaysUi, relayTestResults])

  async function runRelayTests() {
    setRelayTestTriggered(true)
    setRelayTestState('running')
    setRelayTestError(null)

    const urls = relaysUi
    const timeoutMs = RELAY_WEBSOCKET_TEST_TIMEOUT_MS

    try {
      await Promise.all(
        urls.map(async (url) => {
          const r = await testRelay(url, timeoutMs)
          setRelayTestResults((prev) => ({
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
      <div className="text-xs font-semibold text-brezn-muted">{t('relay.title')}</div>
      <div className="mt-1 text-xs text-brezn-muted">{t('relay.hint')}</div>

      {relaysUi.length === 0 ? (
        <div className="mt-3 text-xs text-brezn-muted">{t('relay.empty')}</div>
      ) : null}

      <div className="mt-3 space-y-2">
        {relaysUi.map((r) => {
          return (
            <div
              key={r}
              className="flex items-center justify-between gap-2 rounded-xl border border-brezn-border bg-brezn-panel p-2"
            >
              <span className="min-w-0 truncate font-mono text-xs">{r}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  const next = relaysUi.filter((x) => x !== r)
                  client.setRelays(next)
                  setRelaysUi(client.getRelays())
                }}
                className="shrink-0 hover:opacity-80 focus:outline-none"
                aria-label={t('relay.removeAria')}
              >
                <CloseIcon />
              </button>
            </div>
          )
        })}
      </div>

      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const trimmed = newRelay.trim()
          if (!trimmed) return
          const next = [...relaysUi, trimmed]
          client.setRelays(next)
          setRelaysUi(client.getRelays())
          setNewRelay('')
          setRelayTestTriggered(false)
        }}
      >
        <div className="flex min-w-0 gap-2">
          <input
            value={newRelay}
            onChange={(e) => setNewRelay(e.target.value)}
            placeholder={t('relay.placeholder')}
            className="min-w-0 flex-1 border border-brezn-text p-2 text-base outline-none"
          />
          <button
            type="submit"
            disabled={!newRelay.trim()}
            className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${buttonBase}`}
          >
            {t('relay.add')}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              client.setRelays([...DEFAULT_RELAYS])
              setRelaysUi(client.getRelays())
              setRelayTestTriggered(false)
            }}
            className={`shrink-0 rounded-xl px-3 py-2 text-xs ${buttonBase}`}
          >
            {t('relay.default')}
          </button>
          <button
            type="button"
            onClick={() => void runRelayTests()}
            disabled={relayTestState === 'running' || relaysUi.length === 0}
            className={`shrink-0 rounded-xl px-3 py-2 text-xs ${buttonBase}`}
          >
            {relayTestState === 'running' ? t('relay.testing') : t('relay.test')}
          </button>
        </div>
      </form>

      {relayTestState === 'error' && relayTestError ? (
        <div className="mt-2 text-xs text-brezn-error">{relayTestError}</div>
      ) : null}

      {relayTestTriggered ? (
        <div className="mt-3 space-y-2">
          {relaysUi.map((url) => {
            const s = relayStatusesByUrl[url] ?? { url, reachable: 'unknown' as const }
            return (
              <div
                key={`${url}-status`}
                className="flex items-center justify-between gap-2 rounded-xl border border-brezn-border bg-brezn-panel p-2"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs">{url}</div>
                  <div className="truncate text-[11px] text-brezn-muted">
                    {s.reachable === 'unknown'
                      ? t('relay.unknown')
                      : s.reachable
                        ? typeof s.rttMs === 'number'
                          ? t('relay.reachableWithRtt', { rtt: s.rttMs })
                          : t('relay.reachable')
                        : s.lastError
                          ? t('relay.unreachableWithErr', { error: s.lastError })
                          : t('relay.unreachable')}
                  </div>
                </div>
                <div
                  className={cn(
                    'h-2.5 w-2.5 shrink-0 rounded-full',
                    s.reachable === 'unknown'
                      ? 'bg-brezn-muted/50'
                      : s.reachable
                        ? 'bg-brezn-success'
                        : 'bg-brezn-error',
                  )}
                  aria-label={t('relay.statusAria', {
                    state:
                      s.reachable === 'unknown'
                        ? t('relay.unknown')
                        : s.reachable
                          ? t('relay.reachable')
                          : t('relay.unreachable'),
                  })}
                />
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
