import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import NDK from '@nostr-dev-kit/ndk'
import { NDKEvent, NDKPrivateKeySigner, NDKRelaySet } from '@nostr-dev-kit/ndk'
import type { NDKSubscription } from '@nostr-dev-kit/ndk'
import {
  generateSecretKey,
  getPublicKey,
  nip04,
  nip19,
  type Event,
  type Filter,
} from './nostrPrimitives'
import {
  NIP17_KINDS,
  dmPeerFromRumor,
  rumorToLogicalEvent,
  unwrapGiftWrap,
  wrapDirectMessage,
} from './nip17'
import { NOSTR_KINDS } from './breznNostr'
import { ndkEventToBreznEvent } from './ndkEventUtils'
import { normalizeMutedTerms } from './moderation'
import {
  loadJsonSync,
  saveJsonSync,
  loadEncryptedJson,
  saveEncryptedJson,
  syncBreznIndexedDbWriteConsentFromStorage,
  isBreznStorageConsentGranted,
  grantBreznIndexedDbWrites,
  noteSkHexDurableInIndexedDb,
  readIndexedDbValue,
} from './storage'
import { DEFAULT_NIP96_SERVER } from './mediaUpload'
import {
  DM_PEER_MODERATION_TEXT_MAX,
  FOLLOWED_PUBKEYS_MAX,
  GET_DM_PARTIAL_PER_RELAY_TIMEOUT_MS,
  GET_DM_HISTORY_TIMEOUT_MS,
  GET_MY_PROFILE_FETCH_TIMEOUT_MS,
  IDENTITY_INIT_TIMEOUT_MS,
  BREZN_APP_STATE_LS_KEY,
} from './constants'
import {
  SK_PROTECTION_DEVICE,
  SK_PROTECTION_PASSWORD,
  type SkProtection,
  isPasswordWrappedSk,
  isLegacyPlainSkHex,
  isDeviceWrappedSk,
  wrapSkWithPassword,
  openPasswordSession,
  rewrapSkWithSession,
  type PasswordSession,
} from './skVault'

const shouldConnectNdkRelays = typeof process === 'undefined' || process.env.VITEST !== 'true'

function connectNdkRelays(ndk: NDK): void {
  if (!shouldConnectNdkRelays) return
  void ndk.connect(5000)
}

/**
 * Bootstrap relay URLs passed into `new NDK({ explicitRelayUrls })` when the user clears a manual relay list.
 * Brezn never enables NDK outbox mode and never auto-connects profile (NIP-65) relays—traffic stays on relays the user chose or these defaults until they override them.
 */
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://offchain.pub',
  'wss://bitcoiner.social',
  'wss://search.nos.today',
  'wss://relay.ditto.pub',
] as const

/** Bump when DEFAULT_RELAYS gains URLs so older saved bootstrap lists pick them up once. */
const BOOTSTRAP_RELAYS_REV = 1

const LS_KEY = BREZN_APP_STATE_LS_KEY

type StoredStateV1 = {
  /**
   * Secret key: plaintext hex only in RAM after unlock/load.
   * On disk: device AES-GCM ciphertext (non-extractable wrap key in IndexedDB),
   * or `v2:pbkdf2:…` when password protection is on. Not written as plaintext.
   */
  skHex?: string
  /** Default `device` (obfuscation; non-extractable wrap key in IndexedDB). Optional `password` vault. */
  skProtection?: SkProtection
  pubkey?: string
  npub?: string
  mutedTerms: string[]
  blockedPubkeys: string[]
  followedPubkeys?: string[]
  settings?: {
    geohashLength?: number // 0-5, default: 2
    mediaUploadEndpoint?: string
    theme?: 'light' | 'dark' // 'light' or 'dark', default: 'dark'
    /** If set (including `[]`), Brezn pins this list on NDK. If omitted, the bootstrap relay list above applies—still user-visible defaults only, no outbox / auto relay discovery. */
    relays?: string[]
    /** Last applied DEFAULT_RELAYS growth merge; custom lists are stamped and left alone. */
    bootstrapRelaysRev?: number
  }
}

export class IdentityLockedError extends Error {
  constructor(message = 'Secret key is locked — enter your password to unlock') {
    super(message)
    this.name = 'IdentityLockedError'
  }
}

/** Device-wrapped key present but not yet decrypted, or storage still initializing. */
export class IdentityPendingError extends Error {
  constructor(message = 'Secret key is still encrypted — wait for storage to finish loading') {
    super(message)
    this.name = 'IdentityPendingError'
  }
}

/** Stored skHex is unreadable/corrupt; refuse to overwrite with a new random identity. */
export class IdentityCorruptError extends Error {
  constructor(
    message = 'Stored secret key is unreadable. Import an nsec backup to recover — Brezn will not overwrite it.',
  ) {
    super(message)
    this.name = 'IdentityCorruptError'
  }
}

/**
 * Represents a conversation with another user.
 */
export type Conversation = {
  /** Other user's public key (64 hex chars) */
  pubkey: string
  /** Unix timestamp of last message (either direction) */
  lastMessageAt: number
  /** Preview of last message (first 50 chars, or '[encrypted]' if decryption failed) */
  lastMessagePreview: string
  /** Preview of the peer's most recent DM (same slice rules); empty if none decrypted inbound yet */
  lastPeerPreview: string
  /** Longer slice of that peer DM for keyword matching (see `DM_PEER_MODERATION_TEXT_MAX`) */
  lastPeerTextForModeration: string
  /** Unix timestamp of peer's most recent DM used for `lastPeerPreview` */
  lastPeerMessageAt: number
  /** Unix timestamp of viewer's most recent outbound DM to this peer */
  lastViewerMessageAt: number
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
  /** NIP-04 kind 4: ciphertext is not authenticated. */
  legacy?: boolean
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
 * - Direct messages (NIP-17 gift wrap + NIP-44; legacy NIP-04 still readable)
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
      /** If set, pin this relay set (e.g. NIP-50-capable relays). Default: `getRelays()`. */
      relayUrls?: string[]
    },
    traceLabel?: string,
  ): () => void

  /**
   * Relay URLs used for subscriptions and publish.
   * Exactly this list (or bootstrap defaults when the user cleared overrides)—never silent additions via outbox or NIP-65 auto-connect.
   */
  getRelays(): string[]

  /** Pin a manual relay list (normalized, max 30, persisted). */
  setRelays(relays: string[]): void

  /** Clear manual list; restores bootstrap relays above—still fixed URLs only. */
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
   * Pubkeys whose posts are mixed into the chronological feed (local list, not kind 3).
   */
  getFollowedPubkeys(): string[]

  /**
   * Replace the follow list. Invalid entries are dropped; blocked pubkeys are omitted.
   */
  setFollowedPubkeys(pubkeys: string[]): void

  /**
   * Get geohash length for feed queries (0-5).
   * - 0: Global geotagged feed (`#g` = 32 one-char prefixes, plus a second local filter for length≥2 prefixes)
   * - 1: ~5000km × ~2500km per cell (largest)
   * - 2: ~1250km × ~625km per cell (default)
   * - 3: ~156km × ~78km per cell
   * - 4: ~39km × ~19km per cell
   * - 5: ~4.9km × ~4.9km per cell (smallest, most precise)
   *
   * @returns Geohash length (0-5), default: 2
   */
  getGeohashLength(): number

  /**
   * Set geohash length for feed queries.
   * @param length - Geohash length (0-5), will be clamped to valid range. 0 = global geotagged feed.
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
   * Send an encrypted direct message (NIP-17 / NIP-44 gift wrap).
   * Publishes wraps to the recipient and a self-copy for the sender.
   * @param recipientPubkey - Recipient's public key (64 hex chars)
   * @param content - Plaintext message content
   * @returns Promise resolving to the inner rumor event ID
   */
  sendDM(recipientPubkey: string, content: string): Promise<string>

  /**
   * Decrypt a direct message event (NIP-17 gift wrap or legacy NIP-04 kind 4).
   * @param event - Encrypted DM event (kind 1059 or kind 4)
   * @returns Decrypted plaintext
   * @throws If decryption fails
   */
  decryptDM(event: Event): string

  /**
   * Decrypt and normalize a DM wire event into the logical message used by the UI.
   * @returns Parsed DM, or `null` if the event is not a decryptable Brezn DM
   */
  interpretDM(event: Event): (DecryptedDM & { otherPubkey: string }) | null

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
   * Replace the current identity with a newly generated keypair.
   * Old notes and DMs stay on the network under the previous pubkey; this device can no longer sign as that identity.
   */
  rotateIdentity(): { pubkey: string; npub: string }

  /**
   * Flush in-memory state to localStorage / IndexedDB (e.g. after location consent ensures storage is ready).
   */
  persistStateNow(): void

  /** Whether the secret key requires a password unlock for this session. */
  isSecretKeyLocked(): boolean

  /** Current at-rest protection mode (`device` default, or optional `password`). */
  getSkProtection(): SkProtection

  /** Unlock password-protected secret key for this session. */
  unlockSecretKey(password: string): Promise<void>

  /**
   * Enable optional password protection (default off). Re-wraps the current secret key.
   * There is no password reset — only a prior nsec backup can recover a forgotten password.
   */
  enablePasswordProtection(password: string): Promise<void>

  /** Change the vault password (requires current password). */
  changePasswordProtection(currentPassword: string, newPassword: string): Promise<void>

  /** Disable password protection and return to device-bound wrapping (requires current password). */
  disablePasswordProtection(password: string): Promise<void>

  /**
   * Reveal nsec after verifying the vault password when password protection is enabled.
   * When device-only protection is used, returns the nsec without a password.
   */
  revealNsec(password?: string): Promise<string>
}

/** Opt-in to Brezn disk persistence (consent flag + LS / encrypted IDB) and flush current in-memory state. */
export function grantDiskPersistenceAndFlushState(
  client: Pick<BreznNostrClient, 'persistStateNow'>,
): void {
  grantBreznIndexedDbWrites()
  client.persistStateNow()
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

/** Lowercase hex pubkey from the first `p` tag (NIP-04 DM recipient). */
function dmRecipientPubkeyLower(evt: Event): string | null {
  const p = evt.tags.find((t) => t[0] === 'p' && typeof t[1] === 'string')?.[1]
  return p && /^[0-9a-fA-F]{64}$/.test(p) ? p.toLowerCase() : null
}

function invokeSubscriptionOnevent(handler: (evt: Event) => void, raw: NDKEvent): void {
  try {
    handler(ndkEventToBreznEvent(raw))
  } catch (err) {
    console.warn('Brezn: error in subscription onevent handler:', err)
  }
}

// State cache for fast synchronous access
let stateCache: StoredStateV1 | null = null

/** Password-wrapped ciphertext waiting for unlock (module-level; survives before client exists). */
let pendingPasswordWrappedSk: string | null = null
/** Active password session after unlock (derived wrap key in RAM only). */
let passwordSession: PasswordSession | null = null
let identityVaultLocked = false
const identityVaultLockListeners = new Set<() => void>()

/** Fires after a password vault locks (idle timeout or explicit lock). */
export function onIdentityVaultLocked(listener: () => void): () => void {
  identityVaultLockListeners.add(listener)
  return () => {
    identityVaultLockListeners.delete(listener)
  }
}

function notifyIdentityVaultLocked(): void {
  for (const listener of identityVaultLockListeners) listener()
}

export function isIdentityVaultLocked(): boolean {
  return identityVaultLocked
}

/** Drops the in-memory signer of the latest client when the vault locks. */
let clearUnlockedSigner: (() => void) | null = null

/**
 * Drop plaintext from memory and require the password again.
 * No-op unless password protection is on and a wrapped blob is still available.
 * Does not rewrite the blob at rest.
 */
export function lockIdentityVault(): boolean {
  if (getStoredSkProtection() !== SK_PROTECTION_PASSWORD) return false
  const wrapped = pendingPasswordWrappedSk
  if (!wrapped || !isPasswordWrappedSk(wrapped)) return false
  if (!passwordSession && identityVaultLocked) return false
  passwordSession = null
  identityVaultLocked = true
  if (stateCache) {
    stateCache = {
      ...stateCache,
      skHex: wrapped,
      skProtection: SK_PROTECTION_PASSWORD,
    }
  }
  clearUnlockedSigner?.()
  notifyIdentityVaultLocked()
  return true
}

export function getStoredSkProtection(): SkProtection {
  const s =
    stateCache ?? loadJsonSync<StoredStateV1>(LS_KEY, { mutedTerms: [], blockedPubkeys: [] })
  if (
    s.skProtection === SK_PROTECTION_PASSWORD ||
    isPasswordWrappedSk(s.skHex) ||
    pendingPasswordWrappedSk
  ) {
    return SK_PROTECTION_PASSWORD
  }
  return SK_PROTECTION_DEVICE
}

/**
 * Unlock a password-protected identity before or after the client is created.
 * Updates `stateCache` with plaintext `skHex` for the session.
 */
export async function unlockIdentityVault(password: string): Promise<void> {
  const wrapped =
    pendingPasswordWrappedSk ??
    (stateCache?.skHex && isPasswordWrappedSk(stateCache.skHex) ? stateCache.skHex : null) ??
    (() => {
      const raw = loadJsonSync<StoredStateV1>(LS_KEY, { mutedTerms: [], blockedPubkeys: [] })
      return isPasswordWrappedSk(raw.skHex) ? raw.skHex! : null
    })()

  if (!wrapped) throw new Error('No password-protected key to unlock')

  const session = await openPasswordSession(wrapped, password)
  passwordSession = session
  pendingPasswordWrappedSk = await rewrapSkWithSession(session)
  identityVaultLocked = false

  const pubkey = getPublicKey(hexToBytes(session.skHex))
  const npub = nip19.npubEncode(pubkey)
  const prev = stateCache ?? { mutedTerms: [], blockedPubkeys: [] }
  stateCache = {
    ...prev,
    skHex: session.skHex,
    skProtection: SK_PROTECTION_PASSWORD,
    pubkey: prev.pubkey ?? pubkey,
    npub: prev.npub ?? npub,
  }
}

function applyPasswordLockFromLoadedState(loaded: StoredStateV1): StoredStateV1 {
  const sk = loaded.skHex
  if (isPasswordWrappedSk(sk)) {
    pendingPasswordWrappedSk = sk!
    identityVaultLocked = true
    return {
      ...loaded,
      skHex: sk,
      skProtection: SK_PROTECTION_PASSWORD,
    }
  }
  // Password flag without the blob yet (localStorage mirror). Stay locked until IndexedDB settles.
  if (
    loaded.skProtection === SK_PROTECTION_PASSWORD &&
    !passwordSession &&
    !identityStorageInitFinished
  ) {
    identityVaultLocked = true
    return { ...loaded, skProtection: SK_PROTECTION_PASSWORD }
  }
  if (passwordSession && isLegacyPlainSkHex(sk)) {
    identityVaultLocked = false
  }
  return loaded
}

function payloadHasSecret(next: StoredStateV1 | null | undefined): boolean {
  if (!next?.skHex) return pendingPasswordWrappedSk != null
  return (
    isLegacyPlainSkHex(next.skHex) ||
    isPasswordWrappedSk(next.skHex) ||
    isDeviceWrappedSk(next.skHex) ||
    pendingPasswordWrappedSk != null
  )
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/** IndexedDB wins for the secret. In-memory edits win only when they differ from the LS snapshot. */
function mergeIdentityState(
  base: StoredStateV1,
  ls: StoredStateV1,
  memory: StoredStateV1 | null,
): StoredStateV1 {
  const memoryPlain = Boolean(memory?.skHex && isLegacyPlainSkHex(memory.skHex))
  const skHex =
    (memoryPlain ? memory?.skHex : undefined) ??
    (typeof base.skHex === 'string' && base.skHex ? base.skHex : undefined) ??
    (typeof ls.skHex === 'string' && ls.skHex ? ls.skHex : undefined) ??
    (typeof memory?.skHex === 'string' && memory.skHex ? memory.skHex : undefined)

  const pick = <T>(
    memoryVal: T | undefined,
    lsVal: T | undefined,
    baseVal: T | undefined,
  ): T | undefined => {
    if (memory && memoryVal !== undefined && !sameJson(memoryVal, lsVal)) return memoryVal
    return baseVal ?? memoryVal ?? lsVal
  }

  return {
    mutedTerms: pick(memory?.mutedTerms, ls.mutedTerms, base.mutedTerms) ?? [],
    blockedPubkeys: pick(memory?.blockedPubkeys, ls.blockedPubkeys, base.blockedPubkeys) ?? [],
    followedPubkeys: pick(memory?.followedPubkeys, ls.followedPubkeys, base.followedPubkeys),
    settings: pick(memory?.settings, ls.settings, base.settings),
    pubkey: memoryPlain
      ? (memory?.pubkey ?? base.pubkey ?? ls.pubkey)
      : (base.pubkey ?? memory?.pubkey ?? ls.pubkey),
    npub: memoryPlain
      ? (memory?.npub ?? base.npub ?? ls.npub)
      : (base.npub ?? memory?.npub ?? ls.npub),
    skProtection: memoryPlain
      ? (memory?.skProtection ?? base.skProtection ?? ls.skProtection)
      : (base.skProtection ?? memory?.skProtection ?? ls.skProtection),
    skHex,
  }
}

/** True after IndexedDB (or a definitive read failure) has finished. */
let identityStorageInitFinished = false
/** A secret was seen in LS or IndexedDB. Keyless writes must not replace it. */
let secretWasPresent = false
let identityInitPromise: Promise<void> | null = null

export function isIdentityStorageReady(): boolean {
  return identityStorageInitFinished
}

/** Pubkey, password flag, or any skHex — IndexedDB may still hold the only secret. */
export function identityMaterialMayExistOnDisk(): boolean {
  const s =
    stateCache ?? loadJsonSync<StoredStateV1>(LS_KEY, { mutedTerms: [], blockedPubkeys: [] })
  if (s.pubkey || s.npub) return true
  if (s.skProtection === SK_PROTECTION_PASSWORD) return true
  if (typeof s.skHex === 'string' && s.skHex.length > 0) return true
  return pendingPasswordWrappedSk != null
}

function initializeStateCache(): Promise<void> {
  if (!identityInitPromise) {
    identityInitPromise = runInitializeStateCache().catch((err) => {
      console.warn('Identity storage init failed:', err)
      identityStorageInitFinished = true
    })
  }
  return identityInitPromise
}

async function runInitializeStateCache(): Promise<void> {
  const ls = loadJsonSync<StoredStateV1>(LS_KEY, { mutedTerms: [], blockedPubkeys: [] })
  if (typeof ls.skHex === 'string' && ls.skHex) secretWasPresent = true

  let idbReadable = false
  let rawHadSk = false
  let fromIdb: StoredStateV1 | null = null

  if (isBreznStorageConsentGranted()) {
    const rec = await readIndexedDbValue<StoredStateV1>(LS_KEY)
    if (rec.ok) {
      idbReadable = true
      if (rec.value && typeof rec.value === 'object' && !Array.isArray(rec.value)) {
        rawHadSk = typeof rec.value.skHex === 'string' && rec.value.skHex.length > 0
        if (rawHadSk) secretWasPresent = true
        fromIdb = await loadEncryptedJson<StoredStateV1>(
          LS_KEY,
          { mutedTerms: [], blockedPubkeys: [] },
          ['skHex'],
        )
      }
    }
  }

  // Read memory after the await so edits made while IndexedDB was in flight are kept.
  const memoryAtMerge = stateCache
  const merged = mergeIdentityState(fromIdb ?? ls, ls, memoryAtMerge)
  if (payloadHasSecret(merged)) secretWasPresent = true
  stateCache = applyPasswordLockFromLoadedState(merged)

  const lsHadSk = typeof ls.skHex === 'string' && ls.skHex.length > 0
  let migrated = false
  if (isBreznStorageConsentGranted() && idbReadable && rawHadSk) {
    noteSkHexDurableInIndexedDb()
  } else if (isBreznStorageConsentGranted() && idbReadable && lsHadSk && stateCache) {
    try {
      await persistStateEncrypted(stateCache)
      migrated = true
    } catch (err) {
      console.warn('Legacy secret key is still only in localStorage:', err)
    }
  } else if (isBreznStorageConsentGranted() && idbReadable && !lsHadSk) {
    noteSkHexDurableInIndexedDb()
  }

  if (
    stateCache &&
    stateCache.skProtection === SK_PROTECTION_PASSWORD &&
    !pendingPasswordWrappedSk &&
    !isPasswordWrappedSk(stateCache.skHex)
  ) {
    identityVaultLocked = false
  }

  identityStorageInitFinished = true

  if ((memoryAtMerge !== null || migrated) && isBreznStorageConsentGranted() && stateCache) {
    try {
      await persistStateEncrypted(stateCache)
    } catch (err) {
      console.warn('Failed to flush identity state after storage init:', err)
    }
  }
}

/**
 * Timeout path: fill settings from LS so the UI can paint, but do NOT mark storage init finished.
 * IndexedDB must still be allowed to complete and win. Do not scrub `skHex` here.
 */
function fallbackStateFromLocalStorage(): void {
  if (stateCache !== null) return
  const loaded = loadJsonSync<StoredStateV1>(LS_KEY, { mutedTerms: [], blockedPubkeys: [] })
  stateCache = applyPasswordLockFromLoadedState(loaded)
}

if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  syncBreznIndexedDbWriteConsentFromStorage()
}

/**
 * Resolves when IndexedDB identity init has settled (no timeout).
 * Callers that must not mint or drop a key wait on this.
 */
export const whenIdentityStorageSettled: Promise<void> =
  typeof window !== 'undefined' ? initializeStateCache().then(() => {}) : Promise.resolve()

/**
 * Resolves when identity/storage init finished, or after a timeout so the shell can paint.
 * The timeout does not scrub secrets and does not mark storage ready.
 */
export const whenIdentityReady: Promise<void> =
  typeof window !== 'undefined'
    ? Promise.race([
        whenIdentityStorageSettled,
        new Promise<void>((resolve) => {
          setTimeout(() => {
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
  stateCache = applyPasswordLockFromLoadedState(loaded)

  if (loaded.skHex && (isDeviceWrappedSk(loaded.skHex) || isPasswordWrappedSk(loaded.skHex))) {
    initializeStateCache().catch(() => {
      // Ignore errors
    })
  }

  return stateCache
}

function canPersistState(): boolean {
  return typeof localStorage !== 'undefined'
}

async function persistStateEncrypted(next: StoredStateV1): Promise<boolean> {
  if (secretWasPresent && !payloadHasSecret(next)) {
    throw new Error('Refusing to overwrite a stored secret key with keyless state')
  }

  const forDisk: StoredStateV1 = { ...next }

  if (next.skProtection === SK_PROTECTION_PASSWORD || passwordSession || pendingPasswordWrappedSk) {
    forDisk.skProtection = SK_PROTECTION_PASSWORD
    if (passwordSession && isLegacyPlainSkHex(next.skHex)) {
      passwordSession = { ...passwordSession, skHex: next.skHex! }
      const wrapped = await rewrapSkWithSession(passwordSession)
      pendingPasswordWrappedSk = wrapped
      forDisk.skHex = wrapped
    } else if (pendingPasswordWrappedSk) {
      forDisk.skHex = pendingPasswordWrappedSk
    } else if (next.skHex && isPasswordWrappedSk(next.skHex)) {
      forDisk.skHex = next.skHex
    } else {
      throw new Error('Cannot persist password-protected key without an active session or blob')
    }
  } else {
    forDisk.skProtection = SK_PROTECTION_DEVICE
  }

  const idbOk = await saveEncryptedJson(
    LS_KEY,
    forDisk,
    forDisk.skProtection === SK_PROTECTION_PASSWORD ? [] : ['skHex'],
  )
  if (!idbOk) {
    throw new Error('IndexedDB did not accept identity state')
  }
  if (payloadHasSecret(forDisk) || payloadHasSecret(next)) {
    secretWasPresent = true
    noteSkHexDurableInIndexedDb()
  }
  return true
}

function saveState(patch: Partial<StoredStateV1>) {
  const next = { ...loadState(), ...patch }
  stateCache = next

  if (!canPersistState()) return
  if (!isBreznStorageConsentGranted()) return

  // Mirror settings immediately. Legacy skHex stays in localStorage until IndexedDB has a copy.
  const forLocal: Partial<StoredStateV1> = { ...next }
  delete forLocal.skHex
  saveJsonSync(LS_KEY, forLocal as StoredStateV1)

  // A keyless snapshot during init would replace the IndexedDB secret. Wait until the read finishes.
  if (!identityStorageInitFinished) return

  void persistStateEncrypted(next).catch((err) => {
    console.warn('Failed to persist encrypted identity state:', err)
  })
}

/** Like saveState, but awaits durable encrypted persist (for vault lifecycle APIs). */
async function saveStateDurable(patch: Partial<StoredStateV1>): Promise<void> {
  if (!identityStorageInitFinished) await initializeStateCache()

  const next = { ...loadState(), ...patch }
  stateCache = next

  if (!canPersistState()) return
  if (!isBreznStorageConsentGranted()) return

  const forLocal: Partial<StoredStateV1> = { ...next }
  delete forLocal.skHex
  saveJsonSync(LS_KEY, forLocal as StoredStateV1)

  await persistStateEncrypted(next)
}

function normalizeRelayUrlStrict(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Failed to add relay: URL cannot be empty')
  let u: URL
  try {
    u = new URL(trimmed)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    throw new Error(`Failed to add relay: ${detail}`, { cause: e })
  }
  if (u.protocol !== 'wss:') {
    const proto = u.protocol ? u.protocol.slice(0, -1) : 'missing'
    throw new Error(`Failed to add relay: use encrypted WebSocket URL (wss://), not ${proto}`)
  }
  u.hash = ''
  u.search = ''
  const s = u.toString()
  return s.endsWith('/') ? s.slice(0, -1) : s
}

function normalizeRelayUrl(input: string): string | null {
  try {
    return normalizeRelayUrlStrict(input)
  } catch {
    return null
  }
}

/** Validates and normalizes a relay URL for settings UI; throws like `setIdentity` with a clear message. */
export function parseRelayUrlOrThrow(input: string): string {
  return normalizeRelayUrlStrict(input)
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

function relayListKey(url: string): string {
  return url.replace(/\/+$/, '').toLowerCase()
}

/** Older saved bootstrap lists (subset of DEFAULT_RELAYS) gain new default URLs once. */
function mergeMissingBootstrapRelays(stored: string[]): string[] {
  const current = normalizeRelays(stored)
  if (current.length === 0) return current
  const defaultKeys = new Set(DEFAULT_RELAYS.map((u) => relayListKey(u)))
  if (!current.every((u) => defaultKeys.has(relayListKey(u)))) return current
  const seen = new Set(current.map((u) => relayListKey(u)))
  const out = [...current]
  for (const d of DEFAULT_RELAYS) {
    const k = relayListKey(d)
    if (seen.has(k)) continue
    if (out.length >= 30) break
    const norm = normalizeRelayUrl(d)
    if (!norm) continue
    seen.add(k)
    out.push(norm)
  }
  return out
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
  const ndk = new NDK({
    explicitRelayUrls: [...DEFAULT_RELAYS],
    filterValidationMode: 'fix',
    aiGuardrails: false,
    /** Legal / UX: never second relay pool or outbox trackers—users choose relays explicitly (defaults above only until overridden). */
    enableOutboxModel: false,
    /** Same rationale: do not pull writers’ relay lists from the signer/NIP-65 automatically. */
    autoConnectUserRelays: false,
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
      const prev = normalizeRelays(stored)
      const rev = s.settings?.bootstrapRelaysRev ?? 0
      if (rev >= BOOTSTRAP_RELAYS_REV) return prev
      const merged = mergeMissingBootstrapRelays(prev)
      saveState({
        settings: { ...s.settings, relays: merged, bootstrapRelaysRev: BOOTSTRAP_RELAYS_REV },
      })
      ndk.explicitRelayUrls = [...merged]
      return merged
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
    saveState({
      settings: { ...s.settings, relays: norm, bootstrapRelaysRev: BOOTSTRAP_RELAYS_REV },
    })
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
      relayUrls: relays,
      onEvent: (e) => invokeSubscriptionOnevent(s.opts.onevent, e),
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

    if (identityVaultLocked || (skHex && isPasswordWrappedSk(skHex) && !passwordSession)) {
      throw new IdentityLockedError()
    }

    if (skHex && isDeviceWrappedSk(skHex)) {
      if (!identityStorageInitFinished) {
        void initializeStateCache()
        throw new IdentityPendingError()
      }
      throw new IdentityCorruptError()
    }

    if (skHex && isPasswordWrappedSk(skHex)) {
      throw new IdentityLockedError()
    }

    if (skHex && !isLegacyPlainSkHex(skHex)) {
      // Unrecognized encoding: refuse to overwrite with a new random key.
      throw new IdentityCorruptError()
    }

    if (!skHex) {
      if (identityVaultLocked || pendingPasswordWrappedSk) {
        throw new IdentityLockedError()
      }
      // Never mint until IndexedDB init has finished — LS may be empty while IDB still holds skHex.
      if (!identityStorageInitFinished) {
        void initializeStateCache()
        throw new IdentityPendingError()
      }
      // Init finished but metadata without secret: refuse to clobber; require nsec import.
      if (s.pubkey || s.npub || s.skProtection === SK_PROTECTION_PASSWORD) {
        throw new IdentityCorruptError(
          'Identity metadata is present but the secret key is missing from storage. Import an nsec backup to recover.',
        )
      }
      // First run / confirmed empty storage — generate once
      const sk = generateSecretKey()
      skHex = bytesToHex(sk)
      const pubkey = getPublicKey(sk)
      const npub = nip19.npubEncode(pubkey)
      saveState({ skHex, pubkey, npub, skProtection: SK_PROTECTION_DEVICE })
      return { skHex, pubkey, npub }
    }

    try {
      const pubkey = getPublicKey(hexToBytes(skHex))
      const npub = nip19.npubEncode(pubkey)
      if (s.pubkey !== pubkey || s.npub !== npub) saveState({ pubkey, npub })
      return { skHex, pubkey, npub }
    } catch (error) {
      console.warn('Invalid secret key bytes; refusing to overwrite stored material:', error)
      throw new IdentityCorruptError()
    }
  }

  function getPublicIdentity(): { pubkey: string; npub: string } {
    const s = loadState()
    if (identityVaultLocked) {
      if (s.pubkey && s.npub) return { pubkey: s.pubkey, npub: s.npub }
      if (pendingPasswordWrappedSk && passwordSession) {
        const pubkey = getPublicKey(hexToBytes(passwordSession.skHex))
        return { pubkey, npub: nip19.npubEncode(pubkey) }
      }
      throw new IdentityLockedError()
    }
    if (s.pubkey && s.npub && !isLegacyPlainSkHex(s.skHex)) {
      // Public identity is known; signing waits until the secret is usable.
      return { pubkey: s.pubkey, npub: s.npub }
    }
    const { pubkey, npub } = ensureIdentity()
    return { pubkey, npub }
  }

  function getPrivateIdentity(): { skHex: string; nsec: string } {
    const { skHex } = ensureIdentity()
    const nsec = nip19.nsecEncode(hexToBytes(skHex))
    return { skHex, nsec }
  }

  function isSecretKeyLocked(): boolean {
    return identityVaultLocked
  }

  function getSkProtection(): SkProtection {
    return getStoredSkProtection()
  }

  async function unlockSecretKey(password: string): Promise<void> {
    await unlockIdentityVault(password)
    const { skHex } = ensureIdentity()
    ndk.signer = new NDKPrivateKeySigner(skHex, ndk)
    resubscribeAll('identity-unlocked')
  }

  async function enablePasswordProtection(password: string): Promise<void> {
    const { skHex, pubkey, npub } = ensureIdentity()
    const wrapped = await wrapSkWithPassword(skHex, password)
    const session = await openPasswordSession(wrapped, password)
    passwordSession = session
    pendingPasswordWrappedSk = wrapped
    identityVaultLocked = false
    await saveStateDurable({
      skHex,
      pubkey,
      npub,
      skProtection: SK_PROTECTION_PASSWORD,
    })
  }

  async function changePasswordProtection(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const wrapped = pendingPasswordWrappedSk
    if (!wrapped || getStoredSkProtection() !== SK_PROTECTION_PASSWORD) {
      throw new Error('Password protection is not enabled')
    }
    const skHex = (await openPasswordSession(wrapped, currentPassword)).skHex
    const newWrapped = await wrapSkWithPassword(skHex, newPassword)
    const session = await openPasswordSession(newWrapped, newPassword)
    passwordSession = session
    pendingPasswordWrappedSk = newWrapped
    identityVaultLocked = false
    const pubkey = getPublicKey(hexToBytes(skHex))
    const npub = nip19.npubEncode(pubkey)
    await saveStateDurable({
      skHex,
      pubkey,
      npub,
      skProtection: SK_PROTECTION_PASSWORD,
    })
  }

  async function disablePasswordProtection(password: string): Promise<void> {
    const wrapped = pendingPasswordWrappedSk
    if (!wrapped && getStoredSkProtection() !== SK_PROTECTION_PASSWORD) {
      throw new Error('Password protection is not enabled')
    }
    const blob = wrapped ?? (isPasswordWrappedSk(loadState().skHex) ? loadState().skHex! : null)
    if (!blob) throw new Error('Password protection is not enabled')
    const skHex = (await openPasswordSession(blob, password)).skHex
    passwordSession = null
    pendingPasswordWrappedSk = null
    identityVaultLocked = false
    const pubkey = getPublicKey(hexToBytes(skHex))
    const npub = nip19.npubEncode(pubkey)
    await saveStateDurable({
      skHex,
      pubkey,
      npub,
      skProtection: SK_PROTECTION_DEVICE,
    })
  }

  async function revealNsec(password?: string): Promise<string> {
    if (getStoredSkProtection() === SK_PROTECTION_PASSWORD) {
      if (!password) throw new Error('Password required to reveal nsec')
      const wrapped = pendingPasswordWrappedSk
      if (!wrapped) throw new Error('Password-protected key missing')
      const skHex = (await openPasswordSession(wrapped, password)).skHex
      return nip19.nsecEncode(hexToBytes(skHex))
    }
    const { nsec } = getPrivateIdentity()
    return nsec
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
    const relaySet = NDKRelaySet.fromRelayUrls(relays, ndk, true, ndk.pool)
    try {
      await ev.publish(relaySet, 60_000, 1)
    } catch (e) {
      if (e == null) {
        throw new Error('Publish failed (no error detail from relay stack).', { cause: e })
      }
      throw e
    }
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
      relayUrls?: string[]
    },
    traceLabel = 'grouped',
  ): () => void {
    const relays = opts.relayUrls ? normalizeRelays(opts.relayUrls) : getRelays()
    if (relays.length === 0 || filters.length === 0) {
      opts.onclose?.(['No relays configured'])
      return () => {}
    }
    const sub = ndk.subscribe(filters, {
      groupable: false,
      subId: `brezn-${traceLabel}`,
      relayUrls: relays,
      onEvent: (e) => invokeSubscriptionOnevent(opts.onevent, e),
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
    const blocked = new Set(normalized.map((p) => p.toLowerCase()))
    const followed = (loadState().followedPubkeys ?? []).filter(
      (p) => !blocked.has(p.toLowerCase()),
    )
    saveState({ blockedPubkeys: normalized, followedPubkeys: followed })
  }

  function normalizeFollowedPubkeys(pubkeys: string[]): string[] {
    const blocked = new Set((loadState().blockedPubkeys ?? []).map((p) => p.toLowerCase()))
    const self = (() => {
      try {
        return ensureIdentity().pubkey.toLowerCase()
      } catch {
        return ''
      }
    })()
    const seen = new Set<string>()
    const normalized: string[] = []
    for (const p of pubkeys) {
      const pk = p?.trim().toLowerCase() ?? ''
      if (pk.length !== 64) continue
      if (!/^[0-9a-f]{64}$/.test(pk)) continue
      if (pk === self) continue
      if (blocked.has(pk)) continue
      if (seen.has(pk)) continue
      seen.add(pk)
      normalized.push(pk)
      if (normalized.length >= FOLLOWED_PUBKEYS_MAX) break
    }
    return normalized
  }

  function getFollowedPubkeys(): string[] {
    return loadState().followedPubkeys ?? []
  }

  function setFollowedPubkeys(pubkeys: string[]): void {
    saveState({ followedPubkeys: normalizeFollowedPubkeys(pubkeys) })
  }

  function getGeohashLength(): number {
    const s = loadState()

    // Check if geohashLength is set
    if (typeof s.settings?.geohashLength === 'number') {
      const len = Math.round(s.settings.geohashLength)
      if (len === 0) return 0
      if (len >= 1 && len <= 5) return len
    }

    return 2
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

  async function publishSigned(event: Event, relayUrls?: readonly string[]): Promise<string> {
    const relays = [...(relayUrls ?? getRelays())]
    if (relays.length === 0) {
      throw new Error('No relays configured')
    }
    const ev = new NDKEvent(ndk, event)
    const relaySet = NDKRelaySet.fromRelayUrls(relays, ndk, true, ndk.pool)
    try {
      await ev.publish(relaySet, 60_000, 1)
    } catch (e) {
      if (e == null) {
        throw new Error('Publish failed (no error detail from relay stack).', { cause: e })
      }
      throw e
    }
    return ev.id
  }

  /** Best-effort: advertise preferred DM inbox relays (NIP-17 kind 10050). */
  async function publishDmRelaysList(): Promise<void> {
    const relays = getRelays()
    if (relays.length === 0) return
    try {
      await publish({
        kind: NOSTR_KINDS.dmRelays,
        content: '',
        tags: relays.map((url) => ['relay', url]),
      })
    } catch {
      // Non-fatal: DMs still work via configured relays.
    }
  }

  /**
   * Fetch recipient kind-10050 DM relays with a short timeout; fall back to our relays.
   */
  async function resolveDmPublishRelays(recipientPubkey: string): Promise<string[]> {
    const fallback = getRelays()
    const peer = recipientPubkey.trim().toLowerCase()
    if (fallback.length === 0) return []

    return await new Promise((resolve) => {
      let settled = false
      let best: Event | null = null
      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(tid)
        unsub()
        const urls: string[] = []
        const seen = new Set<string>()
        for (const t of best?.tags ?? []) {
          if (t[0] !== 'relay' || typeof t[1] !== 'string') continue
          let norm: string
          try {
            const u = new URL(parseRelayUrlOrThrow(t[1]))
            u.username = ''
            u.password = ''
            u.hash = ''
            u.search = ''
            norm = u.toString().replace(/\/+$/, '')
          } catch {
            continue
          }
          const key = norm.toLowerCase()
          if (seen.has(key)) continue
          seen.add(key)
          urls.push(norm)
        }
        resolve(urls.length > 0 ? urls : fallback)
      }
      const tid = setTimeout(finish, 2500)
      const unsub = subscribe(
        { kinds: [NOSTR_KINDS.dmRelays], authors: [peer], limit: 20 },
        {
          immediate: true,
          onevent: (evt) => {
            if (!best || evt.created_at >= best.created_at) best = evt
          },
          oneose: finish,
          onclose: finish,
        },
      )
    })
  }

  type ParsedDm = {
    logicalEvent: Event
    decryptedContent: string
    isFromMe: boolean
    otherPubkey: string
    legacy: boolean
  }

  function parseDmEvent(event: Event): ParsedDm {
    const { skHex, pubkey } = ensureIdentity()
    const me = pubkey.toLowerCase()

    if (event.kind === NOSTR_KINDS.giftWrap) {
      const rumor = unwrapGiftWrap(event, hexToBytes(skHex))
      if (rumor.kind !== NIP17_KINDS.chat && rumor.kind !== NIP17_KINDS.fileMessage) {
        throw new Error(`unsupported NIP-17 rumor kind ${rumor.kind}`)
      }
      const otherPubkey = dmPeerFromRumor(rumor, me)
      if (!otherPubkey) {
        throw new Error('Could not determine DM peer from rumor')
      }
      return {
        logicalEvent: rumorToLogicalEvent(rumor),
        decryptedContent: rumor.content,
        isFromMe: rumor.pubkey.toLowerCase() === me,
        otherPubkey,
        legacy: false,
      }
    }

    if (event.kind === NOSTR_KINDS.encryptedDm) {
      const senderPubkey = event.pubkey
      const isFromMe = senderPubkey.toLowerCase() === me
      let decryptedContent: string
      if (isFromMe) {
        const recipientPubkey = dmRecipientPubkeyLower(event)
        if (!recipientPubkey) {
          throw new Error('Recipient pubkey not found in tags')
        }
        decryptedContent = nip04.decrypt(hexToBytes(skHex), recipientPubkey, event.content)
        return {
          logicalEvent: event,
          decryptedContent,
          isFromMe: true,
          otherPubkey: recipientPubkey,
          legacy: true,
        }
      }
      decryptedContent = nip04.decrypt(hexToBytes(skHex), senderPubkey.toLowerCase(), event.content)
      return {
        logicalEvent: event,
        decryptedContent,
        isFromMe: false,
        otherPubkey: senderPubkey.toLowerCase(),
        legacy: true,
      }
    }

    throw new Error(`unsupported DM event kind ${event.kind}`)
  }

  // Direct Messages (NIP-17 send; NIP-17 + legacy NIP-04 receive)
  async function sendDM(recipientPubkey: string, content: string): Promise<string> {
    await whenIdentityReady
    const { skHex } = ensureIdentity()
    const peerHex = recipientPubkey.trim().toLowerCase()
    if (!/^[0-9a-f]{64}$/.test(peerHex)) {
      throw new Error('Invalid recipient pubkey')
    }
    const plaintext = content
    if (!plaintext.trim()) {
      throw new Error('Message is empty')
    }

    void publishDmRelaysList()

    const { rumor, wraps } = wrapDirectMessage(hexToBytes(skHex), peerHex, plaintext)
    const recipientRelays = await resolveDmPublishRelays(peerHex)
    const ourRelays = getRelays()

    const results = await Promise.allSettled(
      wraps.map((wrap) => {
        const p = dmRecipientPubkeyLower(wrap)
        const urls = p === peerHex ? recipientRelays : ourRelays
        return publishSigned(wrap, urls.length > 0 ? urls : ourRelays)
      }),
    )
    if (!results.some((r) => r.status === 'fulfilled')) {
      const firstErr = results.find((r) => r.status === 'rejected') as
        PromiseRejectedResult | undefined
      throw firstErr?.reason instanceof Error
        ? firstErr.reason
        : new Error('Failed to publish NIP-17 gift wraps')
    }
    return rumor.id
  }

  function decryptDM(event: Event): string {
    try {
      return parseDmEvent(event).decryptedContent
    } catch (e) {
      throw new Error(`Failed to decrypt DM: ${e instanceof Error ? e.message : 'Unknown error'}`, {
        cause: e,
      })
    }
  }

  function interpretDM(event: Event): (DecryptedDM & { otherPubkey: string }) | null {
    try {
      const parsed = parseDmEvent(event)
      return {
        event: parsed.logicalEvent,
        decryptedContent: parsed.decryptedContent,
        isFromMe: parsed.isFromMe,
        otherPubkey: parsed.otherPubkey,
        legacy: parsed.legacy,
      }
    } catch {
      return null
    }
  }

  /**
   * Per-relay DM history: filters on one relay only so a slow relay does not block the others.
   */
  function subscribeDmOnSingleRelay(
    relayUrl: string,
    filters: Filter[],
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

      if (filters.length === 0) {
        finishRelay()
        return
      }

      sub = ndk.subscribe(filters, {
        groupable: false,
        closeOnEose: true,
        relayUrls: [relayUrl],
        exclusiveRelay: true,
        subId: label,
        onEvent: (e) => invokeSubscriptionOnevent(onevent, e),
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

    const conversations = new Map<string, Conversation>()
    const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 90 // last 90 days
    const filters: Filter[] = [
      { kinds: [NOSTR_KINDS.giftWrap], '#p': [me], since, limit: 200 },
      { kinds: [NOSTR_KINDS.encryptedDm], '#p': [me], since, limit: 100 },
      { kinds: [NOSTR_KINDS.encryptedDm], authors: [me], since, limit: 100 },
    ]

    function mergeConversation(
      otherPubkey: string,
      createdAt: number,
      preview: string,
      decryptedForModeration: string,
      fromPeer: boolean,
    ) {
      const existing = conversations.get(otherPubkey)

      let lastMessageAt = existing?.lastMessageAt ?? 0
      let lastMessagePreview = existing?.lastMessagePreview ?? ''
      let lastPeerPreview = existing?.lastPeerPreview ?? ''
      let lastPeerTextForModeration = existing?.lastPeerTextForModeration ?? ''
      let lastPeerMessageAt = existing?.lastPeerMessageAt ?? 0
      let lastViewerMessageAt = existing?.lastViewerMessageAt ?? 0

      if (createdAt >= lastMessageAt) {
        lastMessageAt = createdAt
        lastMessagePreview = preview
      }

      if (fromPeer) {
        if (createdAt >= lastPeerMessageAt) {
          lastPeerMessageAt = createdAt
          lastPeerPreview = preview
          lastPeerTextForModeration = decryptedForModeration
            ? decryptedForModeration.slice(0, DM_PEER_MODERATION_TEXT_MAX)
            : ''
        }
      } else if (createdAt >= lastViewerMessageAt) {
        lastViewerMessageAt = createdAt
      }

      conversations.set(otherPubkey, {
        pubkey: otherPubkey,
        lastMessageAt,
        lastMessagePreview,
        lastPeerPreview,
        lastPeerTextForModeration,
        lastPeerMessageAt,
        lastViewerMessageAt,
      })
    }

    const snapshot = (): Conversation[] =>
      Array.from(conversations.values()).sort((a, b) => b.lastMessageAt - a.lastMessageAt)

    const onProgress = options?.onProgress

    await Promise.all(
      relays.map((relayUrl, idx) =>
        subscribeDmOnSingleRelay(
          relayUrl,
          filters,
          (evt) => {
            try {
              const parsed = parseDmEvent(evt)
              const preview = parsed.decryptedContent.slice(0, 50)
              mergeConversation(
                parsed.otherPubkey,
                parsed.logicalEvent.created_at,
                preview,
                parsed.isFromMe ? '' : parsed.decryptedContent,
                !parsed.isFromMe,
              )
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
    const filters: Filter[] = [
      { kinds: [NOSTR_KINDS.giftWrap], '#p': [me], since, limit: 500 },
      { kinds: [NOSTR_KINDS.encryptedDm], authors: [me], since, limit: 500 },
      { kinds: [NOSTR_KINDS.encryptedDm], authors: [peer], '#p': [me], since, limit: 200 },
    ]

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
          filters,
          (evt) => {
            try {
              const parsed = parseDmEvent(evt)
              if (parsed.otherPubkey !== peer) return
              messages.push({
                event: parsed.logicalEvent,
                decryptedContent: parsed.decryptedContent,
                isFromMe: parsed.isFromMe,
                legacy: parsed.legacy,
              })
            } catch {
              // Skip undecryptable events
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

    type Parsed = {
      name?: string
      picture?: string
      about?: string
    } | null

    return new Promise((resolve, reject) => {
      let settled = false
      let best: Event | null = null
      let unsubOnce: (() => void) | null = null

      const parseBest = (): Parsed => {
        if (!best) return null
        try {
          const data = JSON.parse(best.content ?? '{}')
          return {
            name: typeof data.name === 'string' ? data.name.trim() : undefined,
            picture: typeof data.picture === 'string' ? data.picture.trim() : undefined,
            about: typeof data.about === 'string' ? data.about.trim() : undefined,
          }
        } catch {
          return null
        }
      }

      const cleanup = () => {
        clearTimeout(timeoutTimer)
        unsubOnce?.()
        unsubOnce = null
      }

      const finishOk = (value: Parsed) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(value)
      }

      const finishErr = (err: Error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(err)
      }

      const timeoutTimer = setTimeout(() => {
        finishOk(parseBest())
      }, GET_MY_PROFILE_FETCH_TIMEOUT_MS)

      unsubOnce = subscribe(
        { kinds: [0], authors: [pubkey], limit: 50 },
        {
          onevent: (evt) => {
            if (evt.kind !== 0 || evt.pubkey !== pubkey) return
            if (!best || evt.created_at > best.created_at) best = evt
          },
          oneose: () => {
            finishOk(parseBest())
          },
          onclose: (reasons) => {
            if (reasons.length > 0)
              finishErr(new Error(`Subscription closed: ${reasons.join(', ')}`))
            else finishOk(parseBest())
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
    let prev: {
      name?: string
      picture?: string
      about?: string
    } | null = null
    try {
      prev = await getMyProfile()
    } catch {
      prev = null
    }

    const next: Record<string, unknown> = {}
    const mergeField = (field: 'name' | 'picture' | 'about') => {
      const incoming = metadata[field]
      if (incoming !== undefined) {
        const t = incoming.trim()
        if (t) next[field] = t
        return
      }
      const keep = prev?.[field]?.trim()
      if (keep) next[field] = keep
    }

    mergeField('name')
    mergeField('picture')
    mergeField('about')

    return await publish({
      kind: 0,
      content: JSON.stringify(next),
      tags: [],
    })
  }

  function applyIdentityFromSkHex(skHex: string): { pubkey: string; npub: string } {
    const pubkey = getPublicKey(hexToBytes(skHex))
    const npub = nip19.npubEncode(pubkey)
    // Keep password protection mode if enabled; re-wrap on next persist via session.
    const protection = getStoredSkProtection()
    if (protection === SK_PROTECTION_PASSWORD && passwordSession) {
      passwordSession = { ...passwordSession, skHex }
    } else {
      passwordSession = null
      pendingPasswordWrappedSk = null
      identityVaultLocked = false
    }
    saveState({
      skHex,
      pubkey,
      npub,
      skProtection:
        protection === SK_PROTECTION_PASSWORD ? SK_PROTECTION_PASSWORD : SK_PROTECTION_DEVICE,
    })
    ndk.signer = new NDKPrivateKeySigner(skHex, ndk)
    resubscribeAll('identity-changed')
    return { pubkey, npub }
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

      applyIdentityFromSkHex(skHex)
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to import nsec: ${error.message}`, { cause: error })
      }
      throw new Error('Failed to import nsec: Invalid format', { cause: error })
    }
  }

  function rotateIdentity(): { pubkey: string; npub: string } {
    const skHex = bytesToHex(generateSecretKey())
    return applyIdentityFromSkHex(skHex)
  }

  clearUnlockedSigner = () => {
    ndk.signer = undefined
  }

  // Ensure identity exists immediately unless vault-locked or decrypt still pending.
  if (!identityVaultLocked) {
    try {
      const initialIdentity = ensureIdentity()
      ndk.signer = new NDKPrivateKeySigner(initialIdentity.skHex, ndk)
    } catch (e) {
      if (
        !(e instanceof IdentityPendingError) &&
        !(e instanceof IdentityCorruptError) &&
        !(e instanceof IdentityLockedError)
      ) {
        throw e
      }
      // No signer until storage decrypt finishes, unlock, or nsec import.
    }
  }
  ndk.explicitRelayUrls = [...getRelays()]
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
    getFollowedPubkeys,
    setFollowedPubkeys,
    getGeohashLength,
    setGeohashLength,
    getMediaUploadEndpoint,
    setMediaUploadEndpoint,
    getTheme,
    setTheme,
    sendDM,
    decryptDM,
    interpretDM,
    getConversations,
    getDMsWith,
    updateProfile,
    getMyProfile,
    setIdentity,
    rotateIdentity,
    persistStateNow() {
      saveState(loadState())
    },
    isSecretKeyLocked,
    getSkProtection,
    unlockSecretKey,
    enablePasswordProtection,
    changePasswordProtection,
    disablePasswordProtection,
    revealNsec,
  }
}
