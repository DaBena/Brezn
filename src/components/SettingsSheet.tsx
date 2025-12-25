import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { BreznNostrClient } from '../lib/nostrClient'
import { DEFAULT_RELAYS } from '../lib/nostrClient'
import { geohashPrecisionHint } from '../lib/geo'
import { DEFAULT_NIP96_SERVER, uploadMediaFile } from '../lib/mediaUpload'
import { Sheet } from './Sheet'

type RelayStatusLite = {
  url: string
  reachable: boolean | 'unknown'
  lastError?: string
  rttMs?: number
}

type RelayTestState = 'idle' | 'running' | 'error'

export function SettingsSheet(props: {
  open: boolean
  onClose: () => void
  client: BreznNostrClient
  onModerationChanged?: () => void
  geohashLength: number
  geoCell: string | null
  onGeohashLengthChange: (length: number) => void
}) {
  const { open, onClose, client, onModerationChanged, geohashLength, geoCell, onGeohashLengthChange } = props

  const identity = useMemo(() => client.getPublicIdentity(), [client])

  // --- Keyword blocklist ---
  const [mutedTerms, setMutedTerms] = useState<string[]>(() => client.getMutedTerms())
  const [mutedTermsText, setMutedTermsText] = useState(() => client.getMutedTerms().join('\n'))
  const [mutedTermsMsg, setMutedTermsMsg] = useState<string | null>(null)

  // --- Blocked users ---
  const [blockedPubkeys, setBlockedPubkeys] = useState<string[]>(() => client.getBlockedPubkeys())
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null)

  // --- Relays ---
  const [relays, setRelays] = useState<string[]>(() => client.getRelays())
  const [newRelay, setNewRelay] = useState('')
  const [relayMsg, setRelayMsg] = useState<string | null>(null)
  const [relayStatusesByUrl, setRelayStatusesByUrl] = useState<Record<string, RelayStatusLite>>({})
  const [relayTestState, setRelayTestState] = useState<RelayTestState>('idle')
  const [relayTestError, setRelayTestError] = useState<string | null>(null)
  const [relayTestTriggered, setRelayTestTriggered] = useState(false)

  // --- Private key display ---
  const [showPrivKey, setShowPrivKey] = useState(false)
  const [keyMsg, setKeyMsg] = useState<string | null>(null)

  // --- Media upload endpoint ---
  const [mediaEndpoint, setMediaEndpoint] = useState<string>(() => client.getMediaUploadEndpoint() ?? '')
  const [mediaMsg, setMediaMsg] = useState<string | null>(null)

  // --- Profile ---
  const [profileName, setProfileName] = useState<string>('')
  const [profilePicture, setProfilePicture] = useState<string>('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [profileUploadState, setProfileUploadState] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [profileUploadError, setProfileUploadError] = useState<string | null>(null)
  const profileFileInputId = useId()

  const initialMediaEndpointRef = useRef<string>('')
  const initialProfileRef = useRef<{ name: string; picture: string } | null>(null)
  const [closing, setClosing] = useState(false)

  const privateIdentity = useMemo(() => {
    // computed only when the sheet renders; not shown unless user reveals
    return client.getPrivateIdentity()
  }, [client])


  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      try {
        window.prompt('Kopieren (Strg/Cmd+C), dann OK:', text)
      } catch {
        // ignore
      }
      return false
    }
  }

  function saveMutedTerms(nextTerms: string[], msg: string) {
    setMutedTermsMsg(null)
    client.setMutedTerms(nextTerms)
    const normalized = client.getMutedTerms()
    setMutedTerms(normalized)
    setMutedTermsText(normalized.join('\n'))
    setMutedTermsMsg(msg)
    onModerationChanged?.()
  }

  function unblockUser(pubkey: string) {
    const next = blockedPubkeys.filter(p => p !== pubkey)
    client.setBlockedPubkeys(next)
    setBlockedPubkeys(client.getBlockedPubkeys())
    setBlockedMsg('Nutzer entblockiert.')
    onModerationChanged?.()
  }

  // --- Open/close lifecycle ---
  useEffect(() => {
    if (!open) return
    // Avoid setState directly in effect body (eslint rule).
    const schedule = (fn: () => void) => {
      if (typeof queueMicrotask === 'function') queueMicrotask(fn)
      else window.setTimeout(fn, 0)
    }
      schedule(() => {
        setClosing(false)
        const nextTerms = client.getMutedTerms()
        setMutedTerms(nextTerms)
        setMutedTermsText(nextTerms.join('\n'))
        setMutedTermsMsg(null)
        const nextBlocked = client.getBlockedPubkeys()
        setBlockedPubkeys(nextBlocked)
        setBlockedMsg(null)
        setRelays(client.getRelays())
      setNewRelay('')
      setRelayMsg(null)
      setShowPrivKey(false)
      setKeyMsg(null)
      {
        const ep = client.getMediaUploadEndpoint() ?? ''
        initialMediaEndpointRef.current = ep
        setMediaEndpoint(ep)
      }
      setMediaMsg(null)
      // Load profile
      setProfileLoading(true)
      client
        .getMyProfile()
        .then(profile => {
          const name = profile?.name ?? ''
          const picture = profile?.picture ?? ''
          initialProfileRef.current = { name, picture }
          setProfileName(name)
          setProfilePicture(picture)
          setProfileLoading(false)
        })
        .catch(() => {
          initialProfileRef.current = { name: '', picture: '' }
          setProfileName('')
          setProfilePicture('')
          setProfileLoading(false)
        })
      setProfileMsg(null)
      setProfileSaving(false)
      setProfileUploadState('idle')
      setProfileUploadError(null)
    })
  }, [client, open])

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

  function asErrorMessage(e: unknown): string {
    if (e instanceof Error) return e.message
    if (typeof e === 'string') return e
    return String(e)
  }

  async function persistAndClose() {
    if (closing) return
    if (profileLoading) {
      onClose()
      return
    }
    if (profileUploadState === 'uploading') return
    if (profileSaving) return

    setClosing(true)
    setMediaMsg(null)
    setProfileMsg(null)

    // Persist media endpoint (was previously gated by "Speichern").
    try {
      const trimmed = mediaEndpoint.trim()
      const normalized = trimmed ? trimmed : null // empty => disable
      const current = (client.getMediaUploadEndpoint() ?? '').trim()
      const next = (normalized ?? '').trim()
      if (current !== next) {
        client.setMediaUploadEndpoint(normalized)
        initialMediaEndpointRef.current = client.getMediaUploadEndpoint() ?? ''
      }
    } catch (e) {
      setClosing(false)
      setMediaMsg(asErrorMessage(e))
      return
    }

    // Persist profile metadata (was previously gated by "Profil speichern").
    try {
      const initial = initialProfileRef.current ?? { name: '', picture: '' }
      const nextName = profileName.trim()
      const nextPicture = profilePicture.trim()
      const changed = initial.name.trim() !== nextName || initial.picture.trim() !== nextPicture
      if (changed) {
        setProfileSaving(true)
        await client.updateProfile({ name: profileName, picture: profilePicture })
        initialProfileRef.current = { name: nextName, picture: nextPicture }
      }
    } catch (e) {
      setClosing(false)
      setProfileSaving(false)
      setProfileMsg(e instanceof Error ? e.message : 'Fehler beim Speichern')
      return
    } finally {
      setProfileSaving(false)
    }

    setClosing(false)
    onClose()
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
    <Sheet open={open} title="Einstellungen" onClose={() => void persistAndClose()} dismissible={!closing && !profileSaving && profileUploadState !== 'uploading'}>
      <div className="mt-4 space-y-3">
        <div className="rounded-2xl border border-brezn-border bg-brezn-panel2 p-3">
          <div className="text-xs font-semibold text-brezn-muted">Suchradius</div>
          <div className="mt-1 text-xs text-brezn-muted">
            GeoHash-Länge: {geohashLength} • {geohashPrecisionHint(geohashLength)}
          </div>
          {geoCell ? (
            <div className="mt-1 text-xs text-brezn-muted">
              GeoHash:{' '}
              <span className="rounded-lg border border-brezn-border bg-brezn-panel px-2 py-0.5 font-mono">{geoCell}</span>
            </div>
          ) : (
            <div className="mt-1 text-xs text-brezn-muted">GeoHash: –</div>
          )}
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={geohashLength}
            onChange={e => onGeohashLengthChange(Number(e.target.value))}
            className="mt-3 w-full"
            aria-label="GeoHash-Länge"
          />
          <div className="mt-1 text-xs text-brezn-muted">
            Länge {geohashLength} ({geohashPrecisionHint(geohashLength)})
          </div>
        </div>

        <div className="rounded-2xl border border-brezn-border bg-brezn-panel2 p-3">
          <div className="text-xs font-semibold text-brezn-muted">Blockliste</div>
          <div className="mt-1 text-xs text-brezn-muted">1 Zeile = 1 Begriff ({mutedTerms.length}/200)</div>
          <textarea
            value={mutedTermsText}
            onChange={e => setMutedTermsText(e.target.value)}
            onBlur={() => saveMutedTerms(mutedTermsText.split('\n').map(l => l.trim()).filter(Boolean), 'Blockliste gespeichert.')}
            placeholder={'z. B.\nspam\nkauf jetzt\ntelegram.me'}
            className="mt-2 h-28 w-full resize-none rounded-xl border border-brezn-border bg-brezn-panel2 p-2 font-mono text-xs outline-none focus:ring-2 focus:ring-brezn-gold/40"
          />
          {mutedTermsMsg ? <div className="mt-2 text-xs text-brezn-muted">{mutedTermsMsg}</div> : null}
        </div>

        <div className="rounded-2xl border border-brezn-border bg-brezn-panel2 p-3">
          <div className="text-xs font-semibold text-brezn-muted">Blockierte Nutzer</div>
          <div className="mt-1 text-xs text-brezn-muted">{blockedPubkeys.length} blockiert</div>
          {blockedPubkeys.length > 0 ? (
            <div className="mt-3 space-y-2">
              {blockedPubkeys.map(pubkey => (
                <div
                  key={pubkey}
                  className="flex items-center justify-between gap-2 rounded-xl border border-brezn-border bg-brezn-panel p-2"
                >
                  <div className="min-w-0 flex-1 truncate font-mono text-xs">{pubkey}</div>
                  <button
                    type="button"
                    onClick={() => unblockUser(pubkey)}
                    className="shrink-0 rounded-lg border border-brezn-border bg-brezn-panel2 px-3 py-1.5 text-[11px] font-semibold hover:bg-brezn-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
                  >
                    Entblockieren
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-xs text-brezn-muted">Keine blockierten Nutzer</div>
          )}
          {blockedMsg ? <div className="mt-2 text-xs text-brezn-muted">{blockedMsg}</div> : null}
        </div>

        <div className="rounded-2xl border border-brezn-border bg-brezn-panel2 p-3">
          <div className="text-xs font-semibold text-brezn-muted">Identität</div>
          <div className="mt-1 text-xs text-brezn-muted">
            <span className="font-mono">npub</span>:
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate rounded-xl border border-brezn-border bg-brezn-panel p-2 font-mono text-xs">
              {identity.npub}
            </div>
            <button
              type="button"
              onClick={() => {
                void copyToClipboard(identity.npub).then(ok => {
                  setKeyMsg(ok ? 'npub kopiert.' : 'npub anzeigen & kopieren.')
                })
              }}
              className="shrink-0 rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-xs hover:bg-brezn-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
            >
              Kopieren
            </button>
          </div>

          <div className="mt-3 text-xs text-brezn-muted">
            <span className="font-mono">nsec</span>:
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate rounded-xl border border-brezn-border bg-brezn-panel p-2 font-mono text-xs">
              {showPrivKey ? privateIdentity.nsec : '••••••••••••••••••••••••••••••••'}
            </div>
            <button
              type="button"
              onClick={() => setShowPrivKey(v => !v)}
              className="shrink-0 rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-xs hover:bg-brezn-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
            >
              {showPrivKey ? 'Verbergen' : 'Anzeigen'}
            </button>
            <button
              type="button"
              onClick={() => {
                void copyToClipboard(privateIdentity.nsec).then(ok => {
                  setKeyMsg(ok ? 'nsec kopiert.' : 'nsec anzeigen & kopieren.')
                })
              }}
              className="shrink-0 rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-xs hover:bg-brezn-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
              disabled={!showPrivKey}
            >
              Kopieren
            </button>
          </div>
          <div className="mt-2 text-[11px] text-brezn-muted">
            Teile deinen <span className="font-mono">nsec</span> nie.
          </div>
          {keyMsg ? <div className="mt-2 text-xs text-brezn-muted">{keyMsg}</div> : null}
        </div>

        <div className="rounded-2xl border border-brezn-border bg-brezn-panel2 p-3">
          <div className="text-xs font-semibold text-brezn-muted">Relays</div>
          <div className="mt-1 text-xs text-brezn-muted">Relays für Laden & Posten.</div>

          <div className="mt-3 space-y-2">
            {[...new Set([...DEFAULT_RELAYS, ...relays])].map(r => {
              const enabled = relays.includes(r)
              return (
                <label
                  key={r}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-brezn-border bg-brezn-panel p-2"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={e => {
                        const next = e.target.checked ? [...relays, r] : relays.filter(x => x !== r)
                        client.setRelays(next)
                        setRelays(client.getRelays())
                        setRelayMsg('Relays gespeichert.')
                      }}
                      className="h-4 w-4 accent-brezn-gold"
                    />
                    <span className="min-w-0 truncate font-mono text-xs">{r}</span>
                  </div>
                  {!DEFAULT_RELAYS.includes(r as (typeof DEFAULT_RELAYS)[number]) ? (
                    <button
                      type="button"
                      onClick={e => {
                        e.preventDefault()
                        const next = relays.filter(x => x !== r)
                        client.setRelays(next)
                        setRelays(client.getRelays())
                        setRelayMsg('Relay entfernt.')
                      }}
                      className="shrink-0 rounded-lg border border-brezn-border bg-brezn-panel2 px-2 py-1 text-[11px] hover:bg-brezn-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
                    >
                      Entfernen
                    </button>
                  ) : null}
                </label>
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
              setRelayMsg('Relay hinzugefügt.')
              setRelayTestTriggered(false)
            }}
          >
            <input
              value={newRelay}
              onChange={e => setNewRelay(e.target.value)}
              placeholder="wss://relay.example"
              className="w-full rounded-xl border border-brezn-border bg-brezn-panel p-2 text-sm outline-none focus:ring-2 focus:ring-brezn-gold/40"
            />
            <button
              type="submit"
              className="rounded-xl bg-brezn-gold px-3 py-2 text-xs font-semibold text-brezn-bg hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
            >
              Hinzufügen
            </button>
            <button
              type="button"
              onClick={() => {
                client.setRelays([...DEFAULT_RELAYS])
                setRelays(client.getRelays())
                setRelayMsg('Auf Standard-Relays zurückgesetzt.')
                setRelayTestTriggered(false)
              }}
              className="shrink-0 rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-xs hover:bg-brezn-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => void runRelayTests()}
              disabled={relayTestState === 'running' || relays.length === 0}
              className="shrink-0 rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-xs hover:bg-brezn-panel disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
            >
              {relayTestState === 'running' ? 'Teste…' : 'Testen'}
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

        <div className="rounded-2xl border border-brezn-border bg-brezn-panel2 p-3">
          <div className="text-xs font-semibold text-brezn-muted">Medien-Upload</div>
          <div className="mt-1 text-xs text-brezn-muted">
            Direkt-URL oder NIP-96. Standard: <span className="font-mono">{DEFAULT_NIP96_SERVER}</span>. Leer = aus.
          </div>

          <div className="mt-2 flex gap-2">
            <input
              value={mediaEndpoint}
              onChange={e => setMediaEndpoint(e.target.value)}
              placeholder={DEFAULT_NIP96_SERVER}
              className="w-full rounded-xl border border-brezn-border bg-brezn-panel p-2 text-sm outline-none focus:ring-2 focus:ring-brezn-gold/40"
            />
            <button
              type="button"
              onClick={() => setMediaEndpoint(DEFAULT_NIP96_SERVER)}
              className="shrink-0 rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-xs hover:bg-brezn-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
            >
              Standard
            </button>
          </div>

          {mediaMsg ? <div className="mt-2 text-xs text-brezn-muted">{mediaMsg}</div> : null}
        </div>

        <div className="rounded-2xl border border-brezn-border bg-brezn-panel2 p-3">
          <div className="text-xs font-semibold text-brezn-muted">Profil</div>

          {profileLoading ? (
            <div className="mt-3 text-xs text-brezn-muted">Lade Profil…</div>
          ) : (
            <>
              <div className="mt-3">
                <label htmlFor="profile-name" className="block text-xs text-brezn-muted mb-1">
                  Name
                </label>
                <input
                  id="profile-name"
                  type="text"
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  placeholder="Dein Name (optional)"
                  maxLength={100}
                  className="w-full rounded-xl border border-brezn-border bg-brezn-panel p-2 text-sm outline-none focus:ring-2 focus:ring-brezn-gold/40"
                />
              </div>

              <div className="mt-3">
                <label htmlFor="profile-picture" className="block text-xs text-brezn-muted mb-1">
                  Profilbild
                </label>
                <div className="flex items-center gap-3">
                  {profilePicture ? (
                    <img
                      src={profilePicture}
                      alt="Profilbild"
                      className="h-16 w-16 shrink-0 rounded-full border border-brezn-border bg-brezn-panel object-cover"
                      onError={e => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="h-16 w-16 shrink-0 rounded-full border border-brezn-border bg-brezn-panel" />
                  )}
                  <div className="flex-1">
                    <input
                      id={profileFileInputId}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async e => {
                        const file = e.currentTarget.files?.[0] ?? null
                        e.currentTarget.value = ''
                        if (!file) return

                        const mime = (file.type ?? '').toLowerCase()
                        const name = (file.name ?? '').toLowerCase()
                        const isImage =
                          mime.startsWith('image/') ||
                          name.endsWith('.png') ||
                          name.endsWith('.jpg') ||
                          name.endsWith('.jpeg') ||
                          name.endsWith('.gif') ||
                          name.endsWith('.webp') ||
                          name.endsWith('.avif') ||
                          name.endsWith('.svg')

                        if (!isImage) {
                          setProfileUploadState('error')
                          setProfileUploadError('Nur Bilder werden unterstützt.')
                          return
                        }

                        const maxBytes = 5 * 1024 * 1024 // 5 MB
                        if (file.size > maxBytes) {
                          setProfileUploadState('error')
                          setProfileUploadError('Bild ist zu groß (max. 5 MB).')
                          return
                        }

                        if (!mediaEndpoint) {
                          setProfileUploadState('error')
                          setProfileUploadError('Erst Medien-Upload-Endpunkt konfigurieren.')
                          return
                        }

                        setProfileUploadState('uploading')
                        setProfileUploadError(null)
                        try {
                          const { url } = await uploadMediaFile({ endpoint: mediaEndpoint, file })
                          setProfilePicture(url)
                          setProfileUploadState('idle')
                        } catch (err) {
                          setProfileUploadState('error')
                          setProfileUploadError(err instanceof Error ? err.message : 'Upload fehlgeschlagen.')
                        }
                      }}
                    />
                    <div className="flex gap-2">
                      <label
                        htmlFor={profileFileInputId}
                        className={[
                          'flex-1 rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-xs font-semibold text-center',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40',
                          profileUploadState === 'uploading' ? 'opacity-60 cursor-not-allowed' : 'hover:bg-brezn-panel cursor-pointer',
                        ].join(' ')}
                        tabIndex={profileUploadState === 'uploading' ? -1 : 0}
                        role="button"
                        onKeyDown={e => {
                          if (profileUploadState === 'uploading') return
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            const input = document.getElementById(profileFileInputId) as HTMLInputElement | null
                            input?.click()
                          }
                        }}
                      >
                        {profileUploadState === 'uploading' ? 'Upload…' : profilePicture ? 'Bild ändern' : 'Bild hochladen'}
                      </label>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm('Profil wirklich zurücksetzen? Name und Bild werden entfernt.')) return
                          setProfileSaving(true)
                          setProfileMsg(null)
                          try {
                            await client.updateProfile({ name: '', picture: '' })
                            setProfileName('')
                            setProfilePicture('')
                            initialProfileRef.current = { name: '', picture: '' }
                            setProfileMsg('Profil zurückgesetzt.')
                          } catch (e) {
                            setProfileMsg(e instanceof Error ? e.message : 'Fehler beim Zurücksetzen')
                          } finally {
                            setProfileSaving(false)
                          }
                        }}
                        disabled={profileSaving || profileUploadState === 'uploading'}
                        className="flex-1 rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-xs font-semibold hover:bg-brezn-panel disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
                      >
                        Zurücksetzen
                      </button>
                    </div>
                    {profilePicture ? (
                      <button
                        type="button"
                        onClick={() => setProfilePicture('')}
                        className="mt-1 w-full rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-xs hover:bg-brezn-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
                      >
                        Bild entfernen
                      </button>
                    ) : null}
                  </div>
                </div>
                {profileUploadState === 'error' && profileUploadError ? (
                  <div className="mt-2 text-xs text-brezn-danger">{profileUploadError}</div>
                ) : null}
                {profilePicture ? (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={profilePicture}
                      onChange={e => setProfilePicture(e.target.value)}
                      placeholder="Oder URL direkt eingeben"
                      className="w-full rounded-xl border border-brezn-border bg-brezn-panel p-2 text-xs font-mono outline-none focus:ring-2 focus:ring-brezn-gold/40"
                    />
                  </div>
                ) : null}
              </div>

              {profileMsg ? <div className="mt-2 text-xs text-brezn-muted">{profileMsg}</div> : null}
            </>
          )}
        </div>
      </div>
    </Sheet>
  )
}

