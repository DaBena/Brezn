import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import type { Event, Filter } from 'nostr-tools'
import { SimplePool } from 'nostr-tools/pool'
import * as nip19 from 'nostr-tools/nip19'
import { nip04 } from 'nostr-tools'
import { normalizeMutedTerms } from './moderation'
import { loadJsonSync, saveJsonSync, loadEncryptedJson, saveEncryptedJson } from './storage'
import { DEFAULT_NIP96_SERVER } from './mediaUpload'

// Bootstrap relays: keep this list small-ish (each subscription connects to all of them)
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.snort.social'
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
    relays?: string[]
    theme?: 'light' | 'dark' // 'light' or 'dark', default: 'dark'
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
  subscribe(filter: Filter, opts: { onevent: (evt: Event) => void; oneose?: () => void; onclose?: (reasons: string[]) => void }): () => void

  /**
   * Get list of configured relay URLs.
   * Returns default relays if none configured.
   * @returns Array of WebSocket URLs (wss://...)
   */
  getRelays(): string[]

  /**
   * Set relay URLs. Invalid URLs are filtered out.
   * @param relays - Array of relay URLs (wss://...)
   */
  setRelays(relays: string[]): void

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
   * @returns Promise resolving to decrypted plaintext
   * @throws If decryption fails
   */
  decryptDM(event: Event): Promise<string>

  /**
   * Get list of conversations (unique DM partners).
   * Returns conversations sorted by last message time (newest first).
   * @returns Promise resolving to array of conversations
   */
  getConversations(): Promise<Conversation[]>

  /**
   * Get all direct messages with a specific user.
   * Returns messages sorted by time (oldest first).
   * @param pubkey - Other user's pubkey
   * @returns Promise resolving to array of decrypted DMs
   */
  getDMsWith(pubkey: string): Promise<DecryptedDM[]>

  /**
   * Update profile metadata (kind 0 event).
   * @param metadata - Profile data (name, picture)
   * @returns Promise resolving to event ID
   */
  updateProfile(metadata: { name?: string; picture?: string }): Promise<string>

  /**
   * Get own profile metadata from relays.
   * @returns Promise resolving to profile data or null if not found
   */
  getMyProfile(): Promise<{ name?: string; picture?: string } | null>

  /**
   * Set identity from an nsec (bech32-encoded secret key).
   * This will replace the current identity. Use with caution!
   * @param nsec - Bech32-encoded secret key (starts with "nsec1...")
   * @throws If nsec is invalid or cannot be decoded
   */
  setIdentity(nsec: string): void
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

// State cache for fast synchronous access
let stateCache: StoredStateV1 | null = null
let stateCacheInitialized = false

// Initialize state cache asynchronously from IndexedDB (best effort)
async function initializeStateCache() {
  if (stateCacheInitialized) return
  stateCacheInitialized = true

  try {
    // Load with automatic decryption of skHex
    const loaded = await loadEncryptedJson<StoredStateV1>(
      LS_KEY,
      { mutedTerms: [], blockedPubkeys: [] },
      ['skHex'],
    )
    stateCache = loaded
    // Do not write decrypted skHex to localStorage; it stays only in IndexedDB (encrypted) and in memory.
  } catch {
    // If IndexedDB fails, fallback to localStorage
    const loaded = loadJsonSync<StoredStateV1>(LS_KEY, { mutedTerms: [], blockedPubkeys: [] })
    stateCache = loaded
  }
}

/** Resolves when identity/storage is ready (IndexedDB decrypted or fallback applied). Await before using client identity. */
export const whenIdentityReady: Promise<void> =
  typeof window !== 'undefined' ? initializeStateCache().then(() => {}) : Promise.resolve()

function loadState(): StoredStateV1 {
  // Use cache if available (from IndexedDB or localStorage, already decrypted)
  if (stateCache !== null) {
    return stateCache
  }
  // Fallback to synchronous localStorage read (no skHex there; only IndexedDB has it, encrypted)
  // initializeStateCache() populates stateCache from IndexedDB before app uses identity
  const loaded = loadJsonSync<StoredStateV1>(LS_KEY, { mutedTerms: [], blockedPubkeys: [] })
  stateCache = loaded
  
  // If we got a value with skHex that looks encrypted (contains ':'), trigger async decryption
  if (loaded.skHex && loaded.skHex.includes(':')) {
    // This is likely an encrypted value that wasn't decrypted yet
    // Trigger async initialization to decrypt it
    initializeStateCache().catch(() => {
      // Ignore errors
    })
  }
  
  return loaded
}

function saveState(patch: Partial<StoredStateV1>) {
  const next = { ...loadState(), ...patch }
  stateCache = next

  // Save to localStorage without skHex (secret key only in IndexedDB, encrypted)
  const forLocal: Partial<StoredStateV1> = { ...next }
  delete forLocal.skHex
  saveJsonSync(LS_KEY, forLocal as StoredStateV1)

  // Save full state to IndexedDB with skHex encrypted
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
    // keep path if user provides it (some relays may use it), but normalize trivial "/"
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
 * - WebSocket connections to relays (via SimplePool)
 * - Active subscriptions with automatic cleanup
 * - Persistent state (identity, settings) in localStorage/IndexedDB
 * 
 * Multiple calls return the same client instance (shared state).
 * 
 * @returns BreznNostrClient instance
 */
export function createNostrClient(): BreznNostrClient {
  const pool = new SimplePool({ enablePing: true, enableReconnect: true })

  type SubCloser = { close: (reason?: string) => void }
  type ActiveSub = {
    id: string
    filter: Filter
    opts: { onevent: (evt: Event) => void; oneose?: () => void; onclose?: (reasons: string[]) => void }
    closer: SubCloser | null
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
    // If relays have never been set (undefined), use defaults
    if (stored === undefined) {
      return [...DEFAULT_RELAYS]
    }
    // If relays is an array (even if empty), use it
    if (Array.isArray(stored)) {
      if (stored.length > 0) {
        const norm = normalizeRelays(stored)
        return norm
      }
      // User explicitly removed all relays, return empty array
      return []
    }
    // Fallback (shouldn't happen, but just in case)
    return [...DEFAULT_RELAYS]
  }

  function setRelays(relays: string[]) {
    const norm = normalizeRelays(relays)
    const s = loadState()
    saveState({ settings: { ...s.settings, relays: norm } })
    resubscribeAll('relays-changed')
  }

  function startOrRestartSub(s: ActiveSub, reason: string) {
    // Close old subscription first, but don't wait (non-blocking)
    const oldCloser = s.closer
    if (oldCloser) {
      // Clear immediately to avoid race conditions
      s.closer = null
      try {
        oldCloser.close(`brezn:${reason}`)
      } catch (err) {
        // Ignore WebSocket errors (known race condition in SimplePool)
        if (err instanceof Error && (err.message.includes('CLOSING') || err.message.includes('CLOSED'))) {
          return
        }
      }
    }
    // Create new subscription
    const relays = getRelays()
    if (relays.length === 0) {
      // No relays configured - close subscription immediately
      s.closer = null
      s.opts.onclose?.(['No relays configured'])
      return
    }
    s.closer = pool.subscribeMany(relays, s.filter, {
      onevent: evt => {
        s.opts.onevent(evt)
      },
      oneose: () => {
        try {
          s.opts.oneose?.()
        } catch (err) {
          // Ignore errors in oneose callback - might happen if subscription is closed during EOSE
          console.warn('Error in oneose callback:', err)
        }
      },
      onclose: reasons => {
        s.opts.onclose?.(reasons)
      },
      maxWait: 12_000,
      label: 'brezn',
    }) as unknown as SubCloser
  }

  function resubscribeAll(reason = 'manual') {
    for (const s of activeSubs.values()) startOrRestartSub(s, reason)
  }

  // best-effort: when network comes back, restart subs
  // Note: We DON'T resubscribe on visibilitychange because:
  // 1. SimplePool handles reconnection automatically
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
    
    // Validate skHex: must be 64 hex characters (32 bytes)
    if (skHex && (skHex.includes(':') || skHex.length !== 64)) {
      // Encrypted value or invalid format - handle race condition on first load
      if (skHex.includes(':')) {
        // Encrypted key: retry after async decryption may have completed
        const retry = loadJsonSync<StoredStateV1>(LS_KEY, { mutedTerms: [], blockedPubkeys: [] })
        if (retry.skHex && !retry.skHex.includes(':') && retry.skHex.length === 64) {
          skHex = retry.skHex
          stateCache = retry
        } else {
          // Still encrypted on first load - generate temporary identity (async init will restore real one)
          const sk = generateSecretKey()
          skHex = bytesToHex(sk)
          const pubkey = getPublicKey(sk)
          const npub = nip19.npubEncode(pubkey)
          return { skHex, pubkey, npub }
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
    const evt = finalizeEvent(
      {
        kind: input.kind,
        created_at: nowSec(),
        tags: input.tags,
        content: input.content,
      },
      hexToBytes(skHex),
    )

    const relays = getRelays()
    const pubs = pool.publish(relays, evt)
    return await Promise.any(pubs)
  }

  function subscribe(
    filter: Filter,
    opts: { onevent: (evt: Event) => void; oneose?: () => void; onclose?: (reasons: string[]) => void },
  ): () => void {
    const id = `sub_${++subSeq}`
    const s: ActiveSub = { id, filter, opts, closer: null }
    activeSubs.set(id, s)
    
    // Stagger subscriptions to avoid "too many concurrent REQs"
    // First subscription (usually feed) starts immediately
    // Subsequent subscriptions are delayed by 200ms each
    const delay = activeSubs.size === 1 ? 0 : (activeSubs.size - 1) * 200
    
    if (delay === 0) {
      startOrRestartSub(s, 'subscribe')
    } else {
      scheduleSubscription(s, delay)
    }
    
    return () => {
      activeSubs.delete(id)
      // Remove from pending if not yet started
      pendingSubs = pendingSubs.filter(p => p.id !== id)
      // Safely close subscription - ignore errors from already-closed WebSockets
      if (s.closer) {
        try {
          s.closer.close('ui-unsubscribe')
        } catch (err) {
          // Ignore WebSocket errors (known race condition in SimplePool)
          if (err instanceof Error && (err.message.includes('CLOSING') || err.message.includes('CLOSED'))) {
            // Ignored
          }
        }
        s.closer = null
      }
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
    
    // Default: 1 (for apps with few users)
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
    // Default: 'dark'
    return 'dark'
  }

  function setTheme(theme: 'light' | 'dark') {
    const s = loadState()
    saveState({ settings: { ...s.settings, theme } })
  }

  // Direct Messages (NIP-04)
  async function sendDM(recipientPubkey: string, content: string): Promise<string> {
    const { skHex } = ensureIdentity()
    const encrypted = await nip04.encrypt(hexToBytes(skHex), recipientPubkey, content)
    return await publish({
      kind: 4,
      content: encrypted,
      tags: [['p', recipientPubkey]],
    })
  }

  async function decryptDM(event: Event): Promise<string> {
    const { skHex, pubkey } = ensureIdentity()
    const senderPubkey = event.pubkey
    const isFromMe = senderPubkey === pubkey
    
    try {
      if (isFromMe) {
        // For messages I sent, I need to decrypt with the recipient's pubkey
        // The recipient pubkey is in the 'p' tag
        const recipientPubkey = event.tags.find(t => t[0] === 'p' && typeof t[1] === 'string')?.[1]
        if (!recipientPubkey) {
          throw new Error('Recipient pubkey not found in tags')
        }
        return await nip04.decrypt(hexToBytes(skHex), recipientPubkey, event.content)
      } else {
        // For messages I received, decrypt with sender's pubkey
        return await nip04.decrypt(hexToBytes(skHex), senderPubkey, event.content)
      }
    } catch (e) {
      throw new Error(`Failed to decrypt DM: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  async function getConversations(): Promise<Conversation[]> {
    const { pubkey } = ensureIdentity()

    return new Promise((resolve, reject) => {
      const conversations = new Map<string, { pubkey: string; lastMessageAt: number; lastMessagePreview: string }>()
      const unsubs: Array<() => void> = []
      let resolved = false
      let eoseCount = 0
      const expectedEose = 2 // incoming + outgoing

      const finish = () => {
        if (resolved) return
        resolved = true
        for (const unsub of unsubs) unsub()
        resolve(Array.from(conversations.values()).sort((a, b) => b.lastMessageAt - a.lastMessageAt))
      }

      const timeout = setTimeout(finish, 3000) // Reduced from 5000 to 3000
      const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 90 // last 90 days

      // Subscribe to incoming DMs
      unsubs.push(
        subscribe(
          { kinds: [4], '#p': [pubkey], since, limit: 100 },
          {
            onevent: async evt => {
              try {
                const otherPubkey = evt.pubkey
                if (!otherPubkey) return

                let preview = '[encrypted]'
                try {
                  const decrypted = await decryptDM(evt)
                  preview = decrypted.slice(0, 50)
                } catch {
                  // Keep encrypted preview if decryption fails
                }

                const existing = conversations.get(otherPubkey)
                if (!existing || evt.created_at > existing.lastMessageAt) {
                  conversations.set(otherPubkey, {
                    pubkey: otherPubkey,
                    lastMessageAt: evt.created_at,
                    lastMessagePreview: preview,
                  })
                }
              } catch {
                // Ignore errors for individual events
              }
            },
            oneose: () => {
              eoseCount++
              if (eoseCount >= expectedEose) {
                clearTimeout(timeout)
                finish()
              }
            },
            onclose: reasons => {
              clearTimeout(timeout)
              if (reasons.length > 0) {
                reject(new Error(`Subscription closed: ${reasons.join(', ')}`))
              } else {
                finish()
              }
            },
          },
        ),
      )

      // Subscribe to outgoing DMs
      unsubs.push(
        subscribe(
          { kinds: [4], authors: [pubkey], since, limit: 100 },
          {
            onevent: async evt => {
              try {
                const otherPubkey = evt.tags.find(t => t[0] === 'p' && typeof t[1] === 'string')?.[1] ?? null
                if (!otherPubkey) return

                let preview = '[encrypted]'
                try {
                  const decrypted = await decryptDM(evt)
                  preview = decrypted.slice(0, 50)
                } catch {
                  // Keep encrypted preview if decryption fails
                }

                const existing = conversations.get(otherPubkey)
                if (!existing || evt.created_at > existing.lastMessageAt) {
                  conversations.set(otherPubkey, {
                    pubkey: otherPubkey,
                    lastMessageAt: evt.created_at,
                    lastMessagePreview: preview,
                  })
                }
              } catch {
                // Ignore errors for individual events
              }
            },
            oneose: () => {
              eoseCount++
              if (eoseCount >= expectedEose) {
                clearTimeout(timeout)
                finish()
              }
            },
            onclose: reasons => {
              clearTimeout(timeout)
              if (reasons.length > 0) {
                reject(new Error(`Subscription closed: ${reasons.join(', ')}`))
              } else {
                finish()
              }
            },
          },
        ),
      )
    })
  }

  async function getDMsWith(otherPubkey: string): Promise<DecryptedDM[]> {
    const { pubkey } = ensureIdentity()

    return new Promise((resolve, reject) => {
      const messages: DecryptedDM[] = []
      const unsubs: Array<() => void> = []
      let resolved = false
      let eoseCount = 0
      const expectedEose = 2 // sent + received

      const finish = () => {
        if (resolved) return
        resolved = true
        for (const unsub of unsubs) unsub()
        resolve(messages.sort((a, b) => a.event.created_at - b.event.created_at))
      }

      const timeout = setTimeout(finish, 3000) // Reduced from 5000 to 3000
      const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 90 // last 90 days

      // Subscribe to messages I sent
      unsubs.push(
        subscribe(
          { kinds: [4], authors: [pubkey], '#p': [otherPubkey], since, limit: 200 },
          {
            onevent: async evt => {
              try {
                const decryptedContent = await decryptDM(evt)
                messages.push({
                  event: evt,
                  decryptedContent,
                  isFromMe: true,
                })
              } catch {
                // Skip messages that can't be decrypted
              }
            },
            oneose: () => {
              eoseCount++
              if (eoseCount >= expectedEose) {
                clearTimeout(timeout)
                finish()
              }
            },
            onclose: reasons => {
              clearTimeout(timeout)
              if (reasons.length > 0) {
                reject(new Error(`Subscription closed: ${reasons.join(', ')}`))
              } else {
                finish()
              }
            },
          },
        ),
      )

      // Subscribe to messages I received
      unsubs.push(
        subscribe(
          { kinds: [4], authors: [otherPubkey], '#p': [pubkey], since, limit: 200 },
          {
            onevent: async evt => {
              try {
                const decryptedContent = await decryptDM(evt)
                messages.push({
                  event: evt,
                  decryptedContent,
                  isFromMe: false,
                })
              } catch {
                // Skip messages that can't be decrypted
              }
            },
            oneose: () => {
              eoseCount++
              if (eoseCount >= expectedEose) {
                clearTimeout(timeout)
                finish()
              }
            },
            onclose: reasons => {
              clearTimeout(timeout)
              if (reasons.length > 0) {
                reject(new Error(`Subscription closed: ${reasons.join(', ')}`))
              } else {
                finish()
              }
            },
          },
        ),
      )
    })
  }

  // Profile metadata (kind 0)
  async function getMyProfile(): Promise<{ name?: string; picture?: string } | null> {
    const { pubkey } = ensureIdentity()

    return new Promise((resolve, reject) => {
      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          resolve(null)
        }
      }, 3000)

      const unsub = subscribe(
        { kinds: [0], authors: [pubkey], limit: 1 },
        {
          onevent: evt => {
            if (evt.kind !== 0 || evt.pubkey !== pubkey) return
            try {
              const data = JSON.parse(evt.content ?? '{}')
              clearTimeout(timeout)
              if (!resolved) {
                resolved = true
                resolve({
                  name: typeof data.name === 'string' ? data.name.trim() : undefined,
                  picture: typeof data.picture === 'string' ? data.picture.trim() : undefined,
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
          onclose: reasons => {
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

  async function updateProfile(metadata: { name?: string; picture?: string }): Promise<string> {
    // Nostr events are append-only, so we can just publish the new metadata
    // Clients will use the latest event
    const next: Record<string, unknown> = {}
    if (metadata.name !== undefined && metadata.name.trim()) {
      next.name = metadata.name.trim()
    }
    if (metadata.picture !== undefined && metadata.picture.trim()) {
      next.picture = metadata.picture.trim()
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

      // Save new identity (this will encrypt it automatically)
      saveState({ skHex, pubkey, npub })

      // Resubscribe all active subscriptions with new identity
      resubscribeAll('identity-changed')
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to import nsec: ${error.message}`)
      }
      throw new Error('Failed to import nsec: Invalid format')
    }
  }

  // Ensure identity exists immediately (no "accounts"/login flow).
  ensureIdentity()

  return {
    getPublicIdentity,
    getPrivateIdentity,
    publish,
    subscribe,
    getRelays,
    setRelays,
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
  }
}

