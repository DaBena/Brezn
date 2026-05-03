import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import NDK from '@nostr-dev-kit/ndk'
import { NDKEvent, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import type { NDKSubscription } from '@nostr-dev-kit/ndk'
import {
  generateSecretKey,
  getPublicKey,
  nip04,
  nip19,
  type Event,
  type Filter,
} from './nostrPrimitives'
import { ndkEventToBreznEvent } from './ndkEventUtils'
import { normalizeMutedTerms } from './moderation'
import {
  loadJsonSync,
  saveJsonSync,
  loadEncryptedJson,
  saveEncryptedJson,
  setStorageConsentGiven,
} from './storage'
import { DEFAULT_NIP96_SERVER } from './mediaUpload'
import {
  GET_DM_PARTIAL_PER_RELAY_TIMEOUT_MS,
  GET_DM_HISTORY_TIMEOUT_MS,
  GET_MY_PROFILE_FETCH_TIMEOUT_MS,
  IDENTITY_INIT_TIMEOUT_MS,
} from './constants'

const shouldConnectNdkRelays = typeof process === 'undefined' || process.env.VITEST !== 'true'

function connectNdkRelays(ndk: NDK): void {
  if (!shouldConnectNdkRelays) return
  void ndk.connect(5000)
}

/**
 * Bootstrap relay URLs passed into `new NDK({ explicitRelayUrls })` and restored when clearing manual overrides.
 * NDK itself does not ship a public default list; this is the app’s NDK bootstrap set.
 */
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://offchain.pub',
] as const

const LS_KEY = 'brezn:v1'

type StoredStateV1 = {
  // Private key is stored encrypted (AES-GCM) when Web Crypto API is available.
  // Falls back to plaintext if encryption is not available.
  skHex?: string
  pubkey?: string
  npub?: string
  mutedTerms: string[]
  blockedPubkeys: string[]
  settings?: {
    geohashLength?: number // 1-5, default: 1
    mediaUploadEndpoint?: string
    theme?: 'light' | 'dark' // 'light' or 'dark', default: 'dark'
    /** If set (including `[]`), Brezn pins this list on NDK. If omitted, NDK manages relays (pool + outbox). */
    relays?: string[]
  }
}

/**
 * Represents a conversation with another user.
 */
export type Conversation = {
  /** Other user's public key (64 hex chars) */
  pubkey: string
  /** Unix timestamp of last message */
  lastMessageAt: number
  /** Preview of last message (first 50 chars, or '[encrypted]' if decryption failed) */
  lastMessagePreview: string
}

/** Options for `getConversations`. */
export type GetConversationsOptions = {
  /** Fires after each relay finishes (EOSE/timeout/close) so the UI can show partial results immediately. */
  onProgress?: (conversations: Conversation[]) => void
}

/**
 * Represents a decrypted direct message.
 */
export type DecryptedDM = {
  /** Original encrypted event */
  event: Event
  /** Decrypted plaintext content */
  decryptedContent: string
  /** Whether the message was sent by the current user */
  isFromMe: boolean
}

/** Options for `getDMsWith`. */
export type GetDMsWithOptions = {
  /** Fires after each relay finishes so the thread can render before slower relays complete. */
  onProgress?: (messages: DecryptedDM[]) => void
}

/**
 * Main client interface for Nostr operations in Brezn.
 *
 * The client manages:
 * - Identity (auto-created on first use)
 * - Network connections to Nostr relays
 * - Local moderation (blocklist, muted terms)
 * - Feed preferences (geohash length)
 * - Direct messages (NIP-04 encrypted)
 * - Profile metadata
 *
 * All state is persisted to localStorage/IndexedDB and survives page reloads.
 */
export type BreznNostrClient = {
  /**
   * Get public identity (pubkey and npub).
   * Identity is auto-created on first run if it doesn't exist.
   * @returns Public identity with hex pubkey and bech32-encoded npub
   */
  getPublicIdentity(): { pubkey: string; npub: string }

  /**
   * Get private identity (secret key and nsec).
   * ⚠️ Never share the nsec - it gives full control over the identity.
   * @returns Private identity with hex secret key and bech32-encoded nsec
   */
  getPrivateIdentity(): { skHex: string; nsec: string }

  /**
   * Publish a Nostr event to all configured relays.
   * @param event - Event data (kind, content, tags)
   * @returns Promise resolving to event ID when at least one relay accepts it
   * @throws If all relays reject the event
   */
  publish(event: Pick<Event, 'kind' | 'content' | 'tags'>): Promise<string>

  /**
   * Subscribe to Nostr events matching a filter.
   * Subscriptions are automatically staggered to avoid relay rate limits.
   *
   * @param filter - Nostr filter (kinds, authors, tags, etc.)
   * @param opts - Callbacks for events, EOSE, and close events
   * @returns Unsubscribe function - call to close the subscription
   *
   * @example
   * ```ts
   * const unsub = client.subscribe(
   *   { kinds: [1], '#g': ['u0m'] },
   *   { onevent: (evt) => console.log(evt) }
   * )
   * // Later: unsub()
   * ```
   */
  subscribe(
    filter: Filter,
    opts: {
      onevent: (evt: Event) => void
      oneose?: () => void
      onclose?: (reasons: string[]) => void
      immediate?: boolean
    },
  ): () => void

  /**
   * Subscribe with multiple filters merged into one REQ per relay (NIP-01 filter array).
   * Prefer this over multiple `subscribe` calls for the same logical fetch (feed multi-cell,
   * DMs, etc.) to avoid relay limits like "too many concurrent REQs" and reduce latency.
   */
  subscribeGrouped(
    filters: Filter[],
    opts: {
      onevent: (evt: Event) => void
      oneose?: () => void
      onclose?: (reasons: string[]) => void
    },
    traceLabel?: string,
  ): () => void

  /**
   * Relay URLs used for subscriptions and publish.
   * With no manual override: NDK pool (bootstrap + outbox / profile relays).
   * With override: the persisted list only (fixed relay set, like `subscribeMany` on chosen URLs).
   */
  getRelays(): string[]

  /** Pin a manual relay list (normalized, max 30, persisted). */
  setRelays(relays: string[]): void

  /** Clear manual list: NDK uses bootstrap again and may add relays from the network (outbox). */
  clearRelayOverrides(): void

  /**
   * Get muted keyword terms (blocklist).
   * Terms are normalized (lowercase, trimmed, deduplicated).
   * @returns Array of normalized terms (max 200)
   */
  getMutedTerms(): string[]

  /**
   * Set muted keyword terms. Posts containing these terms are filtered out.
   * @param terms - Array of terms to mute (will be normalized)
   */
  setMutedTerms(terms: string[]): void

  /**
   * Get list of blocked user pubkeys.
   * @returns Array of 64-character hex pubkeys (max 1000)
   */
  getBlockedPubkeys(): string[]

  /**
   * Set blocked user pubkeys. Posts from these users are filtered out.
   * Blocklist is stored locally and not automatically shared with relays.
   * Blocklist is only shared with relays via NIP-56 report events when a report reason is provided.
   * @param pubkeys - Array of pubkeys (invalid ones are filtered out)
   * @returns Promise that resolves when the block list is saved
   */
  setBlockedPubkeys(pubkeys: string[]): Promise<void>

  /**
   * Get geohash length for feed queries (0-5).
   * - 0: Query current cell + east/west neighbors (3 queries total)
   * - 1: ~5000km × ~2500km per cell (largest)
   * - 2: ~1250km × ~625km per cell (default)
   * - 3: ~156km × ~78km per cell
   * - 4: ~39km × ~19km per cell
   * - 5: ~4.9km × ~4.9km per cell (smallest, most precise)
   *
   * @returns Geohash length (0-5), default: 1
   */
  getGeohashLength(): number

  /**
   * Set geohash length for feed queries.
   * @param length - Geohash length (0-5), will be clamped to valid range. 0 = query current + east/west neighbors.
   */
  setGeohashLength(length: number): void

  /**
   * Get media upload endpoint URL.
   * Returns default NIP-96 server if not configured.
   * @returns Endpoint URL or undefined if disabled
   */
  getMediaUploadEndpoint(): string | undefined

  /**
   * Set media upload endpoint URL.
   * @param endpoint - Endpoint URL, or null to disable
   */
  setMediaUploadEndpoint(endpoint: string | null): void

  /**
   * Get theme preference ('light' or 'dark').
   * @returns Theme preference, default: 'dark'
   */
  getTheme(): 'light' | 'dark'

  /**
   * Set theme preference.
   * @param theme - 'light' or 'dark'
   */
  setTheme(theme: 'light' | 'dark'): void

  /**
   * Send an encrypted direct message (NIP-04).
   * @param recipientPubkey - Recipient's public key (64 hex chars)
   * @param content - Plaintext message content
   * @returns Promise resolving to event ID
   */
  sendDM(recipientPubkey: string, content: string): Promise<string>

  /**
   * Decrypt a direct message event (NIP-04).
   * Handles both sent and received messages.
   * @param event - Encrypted DM event (kind 4)
   * @returns Decrypted plaintext (NIP-04 uses sync crypto)
   * @throws If decryption fails
   */
  decryptDM(event: Event): string

  /**
   * Get list of conversations (unique DM partners).
   * Returns conversations sorted by last message time (newest first).
   * @param options - Optional `onProgress` to update the UI as each relay completes (faster first paint).
   * @returns Promise resolving to array of conversations
   */
  getConversations(options?: GetConversationsOptions): Promise<Conversation[]>

  /**
   * Get all direct messages with a specific user.
   * Returns messages sorted by time (oldest first).
   * @param pubkey - Other user's pubkey
   * @param options - Optional `onProgress` so the thread UI can render before every relay finishes.
   * @returns Promise resolving to array of decrypted DMs
   */
  getDMsWith(pubkey: string, options?: GetDMsWithOptions): Promise<DecryptedDM[]>

  /**
   * Update profile metadata (kind 0 event).
   * @param metadata - Profile data (name, picture, about)
   * @returns Promise resolving to event ID
   */
  updateProfile(metadata: { name?: string; picture?: string; about?: string }): Promise<string>

  /**
   * Get own profile metadata from relays.
   * @returns Promise resolving to profile data or null if not found
   */
  getMyProfile(): Promise<{ name?: string; picture?: string; about?: string } | null>

  /**
   * Set identity from an nsec (bech32-encoded secret key).
   * This will replace the current identity. Use with caution!
   * @param nsec - Bech32-encoded secret key (starts with "nsec1...")
   * @throws If nsec is invalid or cannot be decoded
   */
  setIdentity(nsec: string): void

  /**
   * Flush in-memory state to localStorage / IndexedDB (e.g. after location consent ensures storage is ready).
   */
  persistStateNow(): void
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

/** Lowercase hex pubkey from the first `p` tag (NIP-04 DM recipient). */
function dmRecipientPubkeyLower(evt: Event): string | null {
  const p = evt.tags.find((t) => t[0] === 'p' && typeof t[1] === 'string')?.[1]
  return p && /^[0-9a-fA-F]{64}$/.test(p) ? p.toLowerCase() : null
}

// State cache for fast synchronous access
let stateCache: StoredStateV1 | null = null
let stateCacheInitialized = false

/**
 * While `skHex` is still encrypted (IndexedDB decrypt pending), we must not mint a new random
 * key on every `ensureIdentity()` call — that breaks signing vs UI pubkey, DMs, and reaction subs.
 */
let ephemeralIdentityWhileEncrypted: { skHex: string; pubkey: string; npub: string } | null = null

// Initialize state cache asynchronously from IndexedDB (best effort)
async function initializeStateCache() {
  if (stateCacheInitialized) return
  stateCacheInitialized = true

  try {
    const loaded = await loadEncryptedJson<StoredStateV1>(
      LS_KEY,
      { mutedTerms: [], blockedPubkeys: [] },
      ['skHex'],
    )
    stateCache = loaded
  } catch {
    const loaded = loadJsonSync<StoredStateV1>(LS_KEY, { mutedTerms: [], blockedPubkeys: [] })
    stateCache = loaded
  }
}

function fallbackStateFromLocalStorage(): void {
  if (stateCache !== null) return
  stateCacheInitialized = true
  stateCache = loadJsonSync<StoredStateV1>(LS_KEY, { mutedTerms: [], blockedPubkeys: [] })
}

// `whenIdentityReady` runs at import time; IndexedDB must be open before that load (createNostrClient() runs later).
if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  setStorageConsentGiven(true)
}

/** Resolves when identity/storage is ready (IndexedDB decrypted or fallback applied). Await before using client identity. */
export const whenIdentityReady: Promise<void> =
  typeof window !== 'undefined'
    ? Promise.race([
        initializeStateCache().then(() => {}),
        new Promise<void>((resolve) => {
          setTimeout(() => {
            // On GitHub Pages / strict environments IndexedDB can hang; ensure app still loads
            fallbackStateFromLocalStorage()
            resolve()
          }, IDENTITY_INIT_TIMEOUT_MS)
        }),
      ])
    : Promise.resolve()

function loadState(): StoredStateV1 {
  if (stateCache !== null) {
    return stateCache
  }
  const loaded = loadJsonSync<StoredStateV1>(LS_KEY, { mutedTerms: [], blockedPubkeys: [] })
  stateCache = loaded

  if (loaded.skHex && loaded.skHex.includes(':')) {
    initializeStateCache().catch(() => {
      // Ignore errors
    })
  }

  return loaded
}

/** Persist settings and encrypted skHex whenever localStorage exists (browser). Geolocation is unrelated. */
function canPersistState(): boolean {
  return typeof localStorage !== 'undefined'
}

function saveState(patch: Partial<StoredStateV1>) {
  const next = { ...loadState(), ...patch }
  stateCache = next

  if (!canPersistState()) return

  // Save to localStorage without skHex (secret key only in IndexedDB, encrypted)
  const forLocal: Partial<StoredStateV1> = { ...next }
  delete forLocal.skHex
  saveJsonSync(LS_KEY, forLocal as StoredStateV1)

  saveEncryptedJson(LS_KEY, next, ['skHex']).catch(() => {
    // Ignore errors, non-sensitive state is already in localStorage
  })
}

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

function normalizeRelays(relays: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const r of relays) {
    const norm = normalizeRelayUrl(r)
    if (!norm) continue
    const key = norm.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(norm)
  }
  return out.slice(0, 30)
}

/**
 * Creates a new Nostr client instance.
 *
 * The client is a singleton-like instance that manages:
 * - WebSocket connections to relays (via NDK)
 * - Active subscriptions with automatic cleanup
 * - Persistent state (identity, settings) in localStorage/IndexedDB
 *
 * Multiple calls return the same client instance (shared state).
 *
 * @returns BreznNostrClient instance
 */
export function createNostrClient(): BreznNostrClient {
  setStorageConsentGiven(canPersistState())
  const ndk = new NDK({
    explicitRelayUrls: [...DEFAULT_RELAYS],
    filterValidationMode: 'fix',
    aiGuardrails: false,
  })

  type ActiveSub = {
    id: string
    filter: Filter
    opts: {
      onevent: (evt: Event) => void
      oneose?: () => void
      onclose?: (reasons: string[]) => void
      immediate?: boolean
    }
    closer: NDKSubscription | null
  }

  function closeSubSafely(sub: NDKSubscription | null, _reason: string): void {
    if (!sub) return
    try {
      sub.stop()
    } catch {
      // Ignore (e.g. subscription already stopped)
    }
  }

  const activeSubs = new Map<string, ActiveSub>()
  let subSeq = 0
  let pendingSubs: Array<{ id: string; s: ActiveSub; delay: number }> = []
  let subSchedulerTimeout: ReturnType<typeof setTimeout> | null = null

  function scheduleSubscription(s: ActiveSub, delay: number) {
    pendingSubs.push({ id: s.id, s, delay })
    if (subSchedulerTimeout) return // Already scheduling

    // Sort by delay (earliest first)
    pendingSubs.sort((a, b) => a.delay - b.delay)

    const processNext = () => {
      if (pendingSubs.length === 0) {
        subSchedulerTimeout = null
        return
      }

      const next = pendingSubs.shift()!
      startOrRestartSub(next.s, 'subscribe')

      if (pendingSubs.length > 0) {
        const nextDelay = pendingSubs[0].delay - next.delay
        subSchedulerTimeout = setTimeout(processNext, Math.max(0, nextDelay))
      } else {
        subSchedulerTimeout = null
      }
    }

    subSchedulerTimeout = setTimeout(processNext, delay)
  }

  function getRelays(): string[] {
    const s = loadState()
    const stored = s.settings?.relays
    if (Array.isArray(stored)) {
      if (stored.length === 0) return []
      return normalizeRelays(stored)
    }
    try {
      const poolUrls = ndk.pool.urls()
      if (poolUrls.length > 0) return [...poolUrls]
    } catch {
      /* ignore */
    }
    const ex = ndk.explicitRelayUrls
    if (Array.isArray(ex) && ex.length > 0) return [...ex]
    return [...DEFAULT_RELAYS]
  }

  function setRelays(relays: string[]) {
    const norm = normalizeRelays(relays)
    const s = loadState()
    saveState({ settings: { ...s.settings, relays: norm } })
    ndk.explicitRelayUrls = [...norm]
    connectNdkRelays(ndk)
    resubscribeAll('relays-changed')
  }

  function clearRelayOverrides() {
    const s = loadState()
    const settings = { ...s.settings }
    delete settings.relays
    saveState({ settings })
    ndk.explicitRelayUrls = [...DEFAULT_RELAYS]
    connectNdkRelays(ndk)
    resubscribeAll('relays-auto')
  }

  function startOrRestartSub(s: ActiveSub, reason: string) {
    // Close old subscription first, but don't wait (non-blocking)
    const oldCloser = s.closer
    if (oldCloser) {
      s.closer = null
      closeSubSafely(oldCloser, `brezn:${reason}`)
    }
    // Create new subscription
    const relays = getRelays()
    if (relays.length === 0) {
      s.closer = null
      s.opts.onclose?.(['No relays configured'])
      return
    }
    const sub = ndk.subscribe(s.filter, {
      groupable: false,
      subId: s.id,
      onEvent: (e) => s.opts.onevent(ndkEventToBreznEvent(e)),
      onEose: () => {
        try {
          s.opts.oneose?.()
        } catch (err) {
          console.warn('Error in oneose callback:', err)
        }
      },
      onClose: () => {
        s.opts.onclose?.([])
      },
    })
    s.closer = sub
  }

  function resubscribeAll(reason = 'manual') {
    for (const s of activeSubs.values()) startOrRestartSub(s, reason)
  }

  // best-effort: when network comes back, restart subs
  // Note: We DON'T resubscribe on visibilitychange because:
  // 1. NDK pool handles reconnection automatically
  // 2. Resubscribing all subscriptions at once causes "too many concurrent REQs"
  // 3. The subscriptions are still active, just paused
  if (typeof window !== 'undefined') {
    let resubscribeTimeout: ReturnType<typeof setTimeout> | null = null
    window.addEventListener('online', () => {
      // Only resubscribe when network comes back online
      // Debounce to avoid multiple rapid online/offline events
      if (resubscribeTimeout) clearTimeout(resubscribeTimeout)
      resubscribeTimeout = setTimeout(() => {
        resubscribeAll('online')
        resubscribeTimeout = null
      }, 2000)
    })
  }

  function ensureIdentity(): { skHex: string; pubkey: string; npub: string } {
    const s = loadState()
    let skHex = s.skHex

    if (skHex && skHex.length === 64 && !skHex.includes(':') && /^[0-9a-f]{64}$/i.test(skHex)) {
      ephemeralIdentityWhileEncrypted = null
    }

    // Validate skHex: must be 64 hex characters (32 bytes)
    if (skHex && (skHex.includes(':') || skHex.length !== 64)) {
      // Encrypted value or invalid format - handle race condition on first load
      if (skHex.includes(':')) {
        // Encrypted key: retry after async decryption may have completed
        const retry = loadJsonSync<StoredStateV1>(LS_KEY, { mutedTerms: [], blockedPubkeys: [] })
        if (retry.skHex && !retry.skHex.includes(':') && retry.skHex.length === 64) {
          skHex = retry.skHex
          stateCache = retry
          ephemeralIdentityWhileEncrypted = null
        } else {
          // Still encrypted on first load — reuse one temporary identity until decrypt finishes
          if (ephemeralIdentityWhileEncrypted) return ephemeralIdentityWhileEncrypted
          const sk = generateSecretKey()
          skHex = bytesToHex(sk)
          const pubkey = getPublicKey(sk)
          const npub = nip19.npubEncode(pubkey)
          ephemeralIdentityWhileEncrypted = { skHex, pubkey, npub }
          return ephemeralIdentityWhileEncrypted
        }
      } else {
        // Invalid format - generate new identity
        const sk = generateSecretKey()
        skHex = bytesToHex(sk)
        const pubkey = getPublicKey(sk)
        const npub = nip19.npubEncode(pubkey)
        saveState({ skHex, pubkey, npub })
        return { skHex, pubkey, npub }
      }
    }

    if (!skHex || skHex.length !== 64 || !/^[0-9a-f]{64}$/i.test(skHex)) {
      // Invalid or missing key - generate new one
      const sk = generateSecretKey()
      skHex = bytesToHex(sk)
      const pubkey = getPublicKey(sk)
      const npub = nip19.npubEncode(pubkey)
      saveState({ skHex, pubkey, npub })
      return { skHex, pubkey, npub }
    }

    try {
      const pubkey = getPublicKey(hexToBytes(skHex))
      const npub = nip19.npubEncode(pubkey)
      if (s.pubkey !== pubkey || s.npub !== npub) saveState({ pubkey, npub })
      return { skHex, pubkey, npub }
    } catch (error) {
      // Invalid key format - generate new one
      console.warn('Invalid secret key format, generating new identity:', error)
      const sk = generateSecretKey()
      skHex = bytesToHex(sk)
      const pubkey = getPublicKey(sk)
      const npub = nip19.npubEncode(pubkey)
      saveState({ skHex, pubkey, npub })
      return { skHex, pubkey, npub }
    }
  }

  function getPublicIdentity(): { pubkey: string; npub: string } {
    const { pubkey, npub } = ensureIdentity()
    return { pubkey, npub }
  }

  function getPrivateIdentity(): { skHex: string; nsec: string } {
    const { skHex } = ensureIdentity()
    const nsec = nip19.nsecEncode(hexToBytes(skHex))
    return { skHex, nsec }
  }

  async function publish(input: Pick<Event, 'kind' | 'content' | 'tags'>): Promise<string> {
    const { skHex } = ensureIdentity()
    const relays = getRelays()
    if (relays.length === 0) {
      throw new Error('No relays configured')
    }
    ndk.signer = new NDKPrivateKeySigner(skHex, ndk)
    const ev = new NDKEvent(ndk)
    ev.kind = input.kind
    ev.content = input.content
    ev.tags = input.tags
    ev.created_at = nowSec()
    await ev.publish(undefined, 60_000, 1)
    return ev.id
  }

  function subscribe(
    filter: Filter,
    opts: {
      onevent: (evt: Event) => void
      oneose?: () => void
      onclose?: (reasons: string[]) => void
      immediate?: boolean
    },
  ): () => void {
    const id = `sub_${++subSeq}`
    const s: ActiveSub = { id, filter, opts, closer: null }
    activeSubs.set(id, s)

    // Stagger subscriptions to avoid "too many concurrent REQs"; feed (immediate) always starts at once
    const delay = opts.immediate ? 0 : activeSubs.size === 1 ? 0 : (activeSubs.size - 1) * 200

    if (delay === 0) {
      startOrRestartSub(s, 'subscribe')
    } else {
      scheduleSubscription(s, delay)
    }

    return () => {
      activeSubs.delete(id)
      // Remove from pending if not yet started
      pendingSubs = pendingSubs.filter((p) => p.id !== id)
      if (s.closer) {
        closeSubSafely(s.closer, 'ui-unsubscribe')
        s.closer = null
      }
    }
  }

  /**
   * One subscription with multiple filters across the configured relay set (NDK sends a filter array per REQ).
   */
  function subscribeGrouped(
    filters: Filter[],
    opts: {
      onevent: (evt: Event) => void
      oneose?: () => void
      onclose?: (reasons: string[]) => void
    },
    traceLabel = 'grouped',
  ): () => void {
    const relays = getRelays()
    if (relays.length === 0 || filters.length === 0) {
      opts.onclose?.(['No relays configured'])
      return () => {}
    }
    const sub = ndk.subscribe(filters, {
      groupable: false,
      subId: `brezn-${traceLabel}`,
      onEvent: (e) => opts.onevent(ndkEventToBreznEvent(e)),
      onEose: () => opts.oneose?.(),
      onClose: () => opts.onclose?.([]),
    })
    return () => {
      closeSubSafely(sub, 'ui-unsubscribe')
    }
  }

  function getMutedTerms(): string[] {
    return loadState().mutedTerms ?? []
  }

  function setMutedTerms(terms: string[]) {
    const norm = normalizeMutedTerms(terms)
    saveState({ mutedTerms: norm })
  }

  function getBlockedPubkeys(): string[] {
    return loadState().blockedPubkeys ?? []
  }

  async function setBlockedPubkeys(pubkeys: string[]): Promise<void> {
    // Normalize: remove duplicates, filter invalid pubkeys, limit to reasonable size
    const seen = new Set<string>()
    const normalized: string[] = []
    for (const p of pubkeys) {
      const trimmed = p?.trim() ?? ''
      if (!trimmed || trimmed.length !== 64) continue // Nostr pubkeys are 64 hex chars
      if (seen.has(trimmed)) continue
      seen.add(trimmed)
      normalized.push(trimmed)
      if (normalized.length >= 1000) break // Reasonable limit
    }

    // Save locally (blocklist is private, not shared with relays)
    // Blocklist is only shared with relays via NIP-56 report events when a report reason is provided
    saveState({ blockedPubkeys: normalized })
  }

  function getGeohashLength(): number {
    const s = loadState()

    // Check if geohashLength is set
    if (typeof s.settings?.geohashLength === 'number') {
      const len = Math.round(s.settings.geohashLength)
      if (len === 0) return 0
      if (len >= 1 && len <= 5) return len
    }

    return 1
  }

  function setGeohashLength(length: number) {
    const s = loadState()
    if (length === 0) {
      saveState({ settings: { ...s.settings, geohashLength: 0 } })
    } else {
      const clamped = Math.max(1, Math.min(5, Math.round(length))) as 1 | 2 | 3 | 4 | 5
      saveState({ settings: { ...s.settings, geohashLength: clamped } })
    }
  }

  function getMediaUploadEndpoint(): string | undefined {
    const v = loadState().settings?.mediaUploadEndpoint
    if (typeof v === 'string') {
      const trimmed = v.trim()
      // Explicit empty string means "disabled".
      return trimmed ? trimmed : undefined
    }
    // Not configured yet → use a sane NIP-96 default.
    return DEFAULT_NIP96_SERVER
  }

  function setMediaUploadEndpoint(endpoint: string | null) {
    const s = loadState()
    // `null` from the UI means: user explicitly disabled uploads.
    const next = endpoint === null ? '' : endpoint.trim()
    saveState({ settings: { ...s.settings, mediaUploadEndpoint: next } })
  }

  function getTheme(): 'light' | 'dark' {
    const theme = loadState().settings?.theme
    if (theme === 'light' || theme === 'dark') {
      return theme
    }
    // Default: 'light' for new users
    return 'light'
  }

  function setTheme(theme: 'light' | 'dark') {
    const s = loadState()
    saveState({ settings: { ...s.settings, theme } })
  }

  // Direct Messages (NIP-04)
  async function sendDM(recipientPubkey: string, content: string): Promise<string> {
    await whenIdentityReady
    const { skHex } = ensureIdentity()
    const peerHex = recipientPubkey.trim().toLowerCase()
    const encrypted = nip04.encrypt(hexToBytes(skHex), peerHex, content)
    return await publish({
      kind: 4,
      content: encrypted,
      tags: [['p', peerHex]],
    })
  }

  function decryptDM(event: Event): string {
    const { skHex, pubkey } = ensureIdentity()
    const me = pubkey.toLowerCase()
    const senderPubkey = event.pubkey
    const isFromMe = senderPubkey.toLowerCase() === me

    try {
      if (isFromMe) {
        const recipientPubkey = event.tags.find(
          (t) => t[0] === 'p' && typeof t[1] === 'string',
        )?.[1]
        if (!recipientPubkey) {
          throw new Error('Recipient pubkey not found in tags')
        }
        return nip04.decrypt(hexToBytes(skHex), recipientPubkey.toLowerCase(), event.content)
      }
      return nip04.decrypt(hexToBytes(skHex), senderPubkey.toLowerCase(), event.content)
    } catch (e) {
      throw new Error(`Failed to decrypt DM: ${e instanceof Error ? e.message : 'Unknown error'}`, {
        cause: e,
      })
    }
  }

  /**
   * Per-relay DM history: two filters on one relay only so a slow relay does not block the others.
   */
  function subscribeDmOnSingleRelay(
    relayUrl: string,
    filterA: Filter,
    filterB: Filter,
    onevent: (evt: Event) => void,
    label: string,
    timeoutMs: number = GET_DM_HISTORY_TIMEOUT_MS,
  ): Promise<void> {
    return new Promise((resolve) => {
      let resolved = false
      let sub: NDKSubscription | null = null

      const finishRelay = () => {
        if (resolved) return
        resolved = true
        clearTimeout(tid)
        if (sub) closeSubSafely(sub, 'ui-unsubscribe')
        resolve()
      }

      const tid = setTimeout(finishRelay, timeoutMs)

      sub = ndk.subscribe([filterA, filterB], {
        groupable: false,
        closeOnEose: true,
        relayUrls: [relayUrl],
        exclusiveRelay: true,
        subId: label,
        onEvent: (e) => onevent(ndkEventToBreznEvent(e)),
        onEose: finishRelay,
        onClose: finishRelay,
      })
    })
  }

  async function getConversations(options?: GetConversationsOptions): Promise<Conversation[]> {
    await whenIdentityReady
    const { pubkey } = ensureIdentity()
    const me = pubkey.trim().toLowerCase()

    const relays = getRelays()
    if (relays.length === 0) {
      return Promise.reject(new Error('No relays configured'))
    }

    const conversations = new Map<
      string,
      { pubkey: string; lastMessageAt: number; lastMessagePreview: string }
    >()
    const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 90 // last 90 days
    const filterIn: Filter = { kinds: [4], '#p': [me], since, limit: 100 }
    const filterOut: Filter = { kinds: [4], authors: [me], since, limit: 100 }

    function mergeConversation(otherPubkey: string, evt: Event) {
      let preview = '[encrypted]'
      try {
        const decrypted = decryptDM(evt)
        preview = decrypted.slice(0, 50)
      } catch {
        // keep default preview
      }
      const existing = conversations.get(otherPubkey)
      if (!existing || evt.created_at > existing.lastMessageAt) {
        conversations.set(otherPubkey, {
          pubkey: otherPubkey,
          lastMessageAt: evt.created_at,
          lastMessagePreview: preview,
        })
      }
    }

    const snapshot = (): Conversation[] =>
      Array.from(conversations.values()).sort((a, b) => b.lastMessageAt - a.lastMessageAt)

    const onProgress = options?.onProgress

    await Promise.all(
      relays.map((relayUrl, idx) =>
        subscribeDmOnSingleRelay(
          relayUrl,
          filterIn,
          filterOut,
          (evt) => {
            try {
              if (evt.pubkey.toLowerCase() === me) {
                const raw =
                  evt.tags.find((t) => t[0] === 'p' && typeof t[1] === 'string')?.[1] ?? null
                const otherPubkey = raw?.toLowerCase() ?? null
                if (!otherPubkey) return
                mergeConversation(otherPubkey, evt)
              } else {
                const otherPubkey = evt.pubkey?.toLowerCase()
                if (!otherPubkey) return
                mergeConversation(otherPubkey, evt)
              }
            } catch {
              // ignore single-event errors
            }
          },
          `brezn-conversations-${idx}`,
          GET_DM_PARTIAL_PER_RELAY_TIMEOUT_MS,
        ).then(() => {
          onProgress?.(snapshot())
        }),
      ),
    )

    return snapshot()
  }

  async function getDMsWith(
    otherPubkey: string,
    options?: GetDMsWithOptions,
  ): Promise<DecryptedDM[]> {
    await whenIdentityReady
    const { pubkey } = ensureIdentity()
    const me = pubkey.trim().toLowerCase()
    const peer = otherPubkey.trim().toLowerCase()

    const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 90 // last 90 days
    const filterOut: Filter = { kinds: [4], authors: [me], since, limit: 500 }
    const filterIn: Filter = { kinds: [4], authors: [peer], '#p': [me], since, limit: 200 }

    const relays = getRelays()
    if (relays.length === 0) {
      return Promise.reject(new Error('No relays configured'))
    }

    const messages: DecryptedDM[] = []

    const snapshot = (): DecryptedDM[] => {
      const byId = new Map<string, DecryptedDM>()
      for (const m of messages) {
        if (!byId.has(m.event.id)) byId.set(m.event.id, m)
      }
      return [...byId.values()].sort((a, b) => a.event.created_at - b.event.created_at)
    }

    const onProgress = options?.onProgress

    await Promise.all(
      relays.map((relayUrl, idx) =>
        subscribeDmOnSingleRelay(
          relayUrl,
          filterOut,
          filterIn,
          (evt) => {
            const author = evt.pubkey.toLowerCase()
            if (author === me) {
              const rec = dmRecipientPubkeyLower(evt)
              if (rec !== peer) return
              try {
                const decryptedContent = decryptDM(evt)
                messages.push({
                  event: evt,
                  decryptedContent,
                  isFromMe: true,
                })
              } catch {
                // Skip undecryptable outgoing events
              }
            } else if (author === peer) {
              try {
                const decryptedContent = decryptDM(evt)
                messages.push({
                  event: evt,
                  decryptedContent,
                  isFromMe: false,
                })
              } catch {
                // Skip undecryptable incoming events
              }
            }
          },
          `brezn-dm-history-${idx}`,
          GET_DM_PARTIAL_PER_RELAY_TIMEOUT_MS,
        ).then(() => {
          onProgress?.(snapshot())
        }),
      ),
    )

    return snapshot()
  }

  // Profile metadata (kind 0)
  async function getMyProfile(): Promise<{
    name?: string
    picture?: string
    about?: string
  } | null> {
    const { pubkey } = ensureIdentity()

    return new Promise((resolve, reject) => {
      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          resolve(null)
        }
      }, GET_MY_PROFILE_FETCH_TIMEOUT_MS)

      const unsub = subscribe(
        { kinds: [0], authors: [pubkey], limit: 1 },
        {
          onevent: (evt) => {
            if (evt.kind !== 0 || evt.pubkey !== pubkey) return
            try {
              const data = JSON.parse(evt.content ?? '{}')
              clearTimeout(timeout)
              if (!resolved) {
                resolved = true
                resolve({
                  name: typeof data.name === 'string' ? data.name.trim() : undefined,
                  picture: typeof data.picture === 'string' ? data.picture.trim() : undefined,
                  about: typeof data.about === 'string' ? data.about.trim() : undefined,
                })
                unsub()
              }
            } catch {
              // Invalid JSON, ignore
            }
          },
          oneose: () => {
            clearTimeout(timeout)
            if (!resolved) {
              resolved = true
              resolve(null)
              unsub()
            }
          },
          onclose: (reasons) => {
            clearTimeout(timeout)
            if (!resolved) {
              resolved = true
              if (reasons.length > 0) {
                reject(new Error(`Subscription closed: ${reasons.join(', ')}`))
              } else {
                resolve(null)
              }
            }
          },
        },
      )
    })
  }

  async function updateProfile(metadata: {
    name?: string
    picture?: string
    about?: string
  }): Promise<string> {
    // Nostr events are append-only, so we can just publish the new metadata
    // Clients will use the latest event
    const next: Record<string, unknown> = {}
    if (metadata.name !== undefined && metadata.name.trim()) {
      next.name = metadata.name.trim()
    }
    if (metadata.picture !== undefined && metadata.picture.trim()) {
      next.picture = metadata.picture.trim()
    }
    if (metadata.about !== undefined && metadata.about.trim()) {
      next.about = metadata.about.trim()
    }

    return await publish({
      kind: 0,
      content: JSON.stringify(next),
      tags: [],
    })
  }

  function setIdentity(nsec: string): void {
    const trimmed = nsec.trim()
    if (!trimmed) {
      throw new Error('nsec cannot be empty')
    }

    try {
      // Decode nsec (bech32) to get the secret key bytes
      const decoded = nip19.decode(trimmed)
      if (decoded.type !== 'nsec') {
        throw new Error('Invalid nsec: must start with "nsec1"')
      }

      const skBytes = decoded.data
      const skHex = bytesToHex(skBytes)

      // Validate: secret key should be 32 bytes (64 hex chars)
      if (skHex.length !== 64) {
        throw new Error('Invalid nsec: secret key must be 32 bytes')
      }

      // Derive public key from secret key
      const pubkey = getPublicKey(skBytes)
      const npub = nip19.npubEncode(pubkey)

      // Clear state cache to force reload
      stateCache = null
      stateCacheInitialized = false
      ephemeralIdentityWhileEncrypted = null

      // Save new identity (this will encrypt it automatically)
      saveState({ skHex, pubkey, npub })

      ndk.signer = new NDKPrivateKeySigner(skHex, ndk)
      // Resubscribe all active subscriptions with new identity
      resubscribeAll('identity-changed')
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to import nsec: ${error.message}`, { cause: error })
      }
      throw new Error('Failed to import nsec: Invalid format', { cause: error })
    }
  }

  // Ensure identity exists immediately (no "accounts"/login flow).
  const initialIdentity = ensureIdentity()
  ndk.signer = new NDKPrivateKeySigner(initialIdentity.skHex, ndk)
  connectNdkRelays(ndk)

  return {
    getPublicIdentity,
    getPrivateIdentity,
    publish,
    subscribe,
    subscribeGrouped,
    getRelays,
    setRelays,
    clearRelayOverrides,
    getMutedTerms,
    setMutedTerms,
    getBlockedPubkeys,
    setBlockedPubkeys,
    getGeohashLength,
    setGeohashLength,
    getMediaUploadEndpoint,
    setMediaUploadEndpoint,
    getTheme,
    setTheme,
    sendDM,
    decryptDM,
    getConversations,
    getDMsWith,
    updateProfile,
    getMyProfile,
    setIdentity,
    persistStateNow() {
      saveState(loadState())
    },
  }
}
