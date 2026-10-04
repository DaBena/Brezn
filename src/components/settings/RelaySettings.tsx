import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { buttonBase } from '../../lib/buttonStyles'
import { cn } from '../../lib/cn'
import { DEFAULT_RELAYS, parseRelayUrlOrThrow, type BreznNostrClient } from '../../lib/nostrClient'
import { RELAY_WEBSOCKET_TEST_TIMEOUT_MS } from '../../lib/constants'
import { probeMediaUploadEndpoint } from '../../lib/mediaUpload'
import { CloseIcon } from '../CloseIcon'
import { useToast } from '../ToastContext'

type RelayStatusLite = {
  url: string
  reachable: boolean | 'unknown'
  lastError?: string
  rttMs?: number
}

type RelayTestState = 'idle' | 'running' | 'error'

type RemoveRelayDialog =
  { step: 'closed' } | { step: 'askKeys'; url: string } | { step: 'confirmNsec'; url: string }

type RelaySettingsProps = {
  client: BreznNostrClient
  mediaEndpoint?: string
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

export function RelaySettings({ client, mediaEndpoint = '' }: RelaySettingsProps) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [relaysUi, setRelaysUi] = useState<string[]>(() => client.getRelays())
  const [newRelay, setNewRelay] = useState('')
  const [relayTestResults, setRelayTestResults] = useState<Record<string, RelayStatusLite>>({})
  const [mediaTestResult, setMediaTestResult] = useState<RelayStatusLite | null>(null)
  const [relayTestState, setRelayTestState] = useState<RelayTestState>('idle')
  const [relayTestError, setRelayTestError] = useState<string | null>(null)
  const [relayTestTriggered, setRelayTestTriggered] = useState(false)
  const [removeDialog, setRemoveDialog] = useState<RemoveRelayDialog>({ step: 'closed' })
  const [rotatingIdentity, setRotatingIdentity] = useState(false)
  const keepKeysButtonRef = useRef<HTMLButtonElement | null>(null)

  const mediaEndpointTrimmed = mediaEndpoint.trim()

  useEffect(() => {
    setRelaysUi(client.getRelays())
  }, [client])

  const dismissRemoveDialog = useCallback(() => {
    if (rotatingIdentity) return
    if (removeDialog.step === 'confirmNsec') {
      showToast(t('relay.removeIdentityAborted'))
    }
    setRemoveDialog({ step: 'closed' })
  }, [removeDialog.step, rotatingIdentity, showToast, t])

  useEffect(() => {
    if (removeDialog.step === 'closed') return
    const id = window.setTimeout(() => keepKeysButtonRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [removeDialog.step])

  useEffect(() => {
    if (removeDialog.step === 'closed') return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      dismissRemoveDialog()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [dismissRemoveDialog, removeDialog.step])

  function removeRelayOnly(url: string) {
    const next = relaysUi.filter((x) => x !== url)
    client.setRelays(next)
    setRelaysUi(client.getRelays())
    setRemoveDialog({ step: 'closed' })
  }

  function removeRelayAndRotate(url: string) {
    if (rotatingIdentity) return
    setRotatingIdentity(true)
    try {
      const next = relaysUi.filter((x) => x !== url)
      client.setRelays(next)
      client.rotateIdentity()
      client.persistStateNow()
      showToast(t('relay.removeIdentityDone'))
      window.setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (err) {
      setRotatingIdentity(false)
      showToast(asErrorMessage(err), 'error')
    }
  }

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
    setMediaTestResult(null)

    const urls = relaysUi
    const timeoutMs = RELAY_WEBSOCKET_TEST_TIMEOUT_MS

    try {
      await Promise.all([
        ...urls.map(async (url) => {
          const r = await testRelay(url, timeoutMs)
          setRelayTestResults((prev) => ({
            ...prev,
            [url]: r.ok
              ? { url, reachable: true, rttMs: r.rttMs, lastError: undefined }
              : { url, reachable: false, rttMs: undefined, lastError: r.error ?? 'Unreachable' },
          }))
        }),
        ...(mediaEndpointTrimmed
          ? [
              (async () => {
                const ac = new AbortController()
                const timer = globalThis.setTimeout(() => ac.abort(), timeoutMs)
                try {
                  const r = await probeMediaUploadEndpoint(mediaEndpointTrimmed, {
                    signal: ac.signal,
                  })
                  setMediaTestResult(
                    r.ok
                      ? {
                          url: mediaEndpointTrimmed,
                          reachable: true,
                          rttMs: r.rttMs,
                          lastError: undefined,
                        }
                      : {
                          url: mediaEndpointTrimmed,
                          reachable: false,
                          lastError: r.error ?? 'Unreachable',
                        },
                  )
                } finally {
                  globalThis.clearTimeout(timer)
                }
              })(),
            ]
          : []),
      ])
      setRelayTestState('idle')
    } catch (e) {
      setRelayTestState('error')
      setRelayTestError(asErrorMessage(e))
    }
  }

  const canRunTests = relaysUi.length > 0 || mediaEndpointTrimmed.length > 0

  return (
    <>
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
                    setRemoveDialog({ step: 'askKeys', url: r })
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
            try {
              const url = parseRelayUrlOrThrow(trimmed)
              if (relaysUi.some((r) => r.toLowerCase() === url.toLowerCase())) {
                showToast(t('relay.duplicate'), 'error')
                return
              }
              client.setRelays([...relaysUi, url])
              setRelaysUi(client.getRelays())
              setNewRelay('')
              setRelayTestTriggered(false)
            } catch (err) {
              showToast(asErrorMessage(err), 'error')
            }
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
              disabled={relayTestState === 'running' || !canRunTests}
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
            {mediaEndpointTrimmed && mediaTestResult ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-brezn-border bg-brezn-panel p-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-brezn-muted">
                    {t('mediaUpload.title')}
                  </div>
                  <div className="truncate font-mono text-xs">{mediaTestResult.url}</div>
                  <div className="truncate text-[11px] text-brezn-muted">
                    {mediaTestResult.reachable === 'unknown'
                      ? t('relay.unknown')
                      : mediaTestResult.reachable
                        ? typeof mediaTestResult.rttMs === 'number'
                          ? t('relay.reachableWithRtt', { rtt: mediaTestResult.rttMs })
                          : t('relay.reachable')
                        : mediaTestResult.lastError
                          ? t('relay.unreachableWithErr', { error: mediaTestResult.lastError })
                          : t('relay.unreachable')}
                  </div>
                </div>
                <div
                  className={cn(
                    'h-2.5 w-2.5 shrink-0 rounded-full',
                    mediaTestResult.reachable ? 'bg-brezn-success' : 'bg-brezn-error',
                  )}
                  aria-label={t('relay.statusAria', {
                    state: mediaTestResult.reachable
                      ? t('relay.reachable')
                      : t('relay.unreachable'),
                  })}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {removeDialog.step !== 'closed' && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 backdrop-blur-sm"
                style={{ backgroundColor: 'var(--brezn-overlay)' }}
                aria-label={t('common.close')}
                disabled={rotatingIdentity}
                onClick={() => dismissRemoveDialog()}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="relay-remove-dialog-title"
                className="relative z-[1] w-full max-w-sm rounded-xl border border-brezn-border bg-brezn-panel p-4"
              >
                {removeDialog.step === 'askKeys' ? (
                  <>
                    <p className="text-xs text-brezn-muted break-all">
                      {t('relay.removeAskTitle', { url: removeDialog.url })}
                    </p>
                    <div id="relay-remove-dialog-title" className="mt-2 text-sm font-semibold">
                      {t('relay.removeAskBody')}
                    </div>
                    <p className="mt-2 text-xs text-brezn-muted">{t('relay.removeAskLoss')}</p>
                    <button
                      ref={keepKeysButtonRef}
                      type="button"
                      disabled={rotatingIdentity}
                      onClick={() => removeRelayOnly(removeDialog.url)}
                      className={`mt-4 w-full rounded-xl px-3 py-2 text-xs font-semibold ${buttonBase}`}
                    >
                      {t('relay.removeKeepKeys')}
                    </button>
                    <button
                      type="button"
                      disabled={rotatingIdentity}
                      onClick={() =>
                        setRemoveDialog({ step: 'confirmNsec', url: removeDialog.url })
                      }
                      className="mt-3 w-full rounded-lg px-2 py-1 text-[11px] text-brezn-error hover:opacity-80 focus:outline-none"
                    >
                      {t('relay.removeChangeKeys')}
                    </button>
                  </>
                ) : (
                  <>
                    <div id="relay-remove-dialog-title" className="text-sm font-semibold">
                      {t('relay.removeNsecTitle')}
                    </div>
                    <p className="mt-2 text-xs text-brezn-muted">{t('relay.removeNsecBody')}</p>
                    <button
                      ref={keepKeysButtonRef}
                      type="button"
                      disabled={rotatingIdentity}
                      onClick={() => dismissRemoveDialog()}
                      className={`mt-4 w-full rounded-xl px-3 py-2 text-xs font-semibold ${buttonBase}`}
                    >
                      {t('relay.removeNsecNo')}
                    </button>
                    <button
                      type="button"
                      disabled={rotatingIdentity}
                      onClick={() => removeRelayAndRotate(removeDialog.url)}
                      className="mt-3 w-full rounded-lg px-2 py-1 text-[11px] text-brezn-error hover:opacity-80 focus:outline-none"
                    >
                      {t('relay.removeNsecYes')}
                    </button>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
