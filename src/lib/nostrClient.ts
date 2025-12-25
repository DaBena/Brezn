import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import type { Event, Filter } from 'nostr-tools'
import { SimplePool } from 'nostr-tools/pool'
import * as nip19 from 'nostr-tools/nip19'
import { nip04 } from 'nostr-tools'
import { normalizeMutedTerms } from './moderation'
import { loadJson, saveJson } from './storage'
import { DEFAULT_NIP96_SERVER } from './mediaUpload'
import { LOCAL_RADIUS_MAX_KM } from './geo'

// Bootstrap relays: keep this list small-ish (each subscription connects to all of them),
// but globally distributed for robustness.
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nostr-pub.wellorder.net',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://relay.primal.net',
  'wss://relay.nostr.com.au',
  'wss://offchain.pub',
] as const

const LS_KEY = 'brezn:v1'

type StoredStateV1 = {
  // Private key is ALWAYS stored as plaintext hex in localStorage.
  skHex?: string
  pubkey?: string
  npub?: string
  mutedTerms: string[]
  blockedPubkeys: string[]
  settings?: {
    localRadiusKm?: number
    mediaUploadEndpoint?: string
    relays?: string[]
  }
}

export type Conversation = {
  pubkey: string
  lastMessageAt: number
  lastMessagePreview: string
}

export type DecryptedDM = {
  event: Event
  decryptedContent: string
  isFromMe: boolean
}

export type BreznNostrClient = {
  // identity (always present; auto-created on first run)
  getPublicIdentity(): { pubkey: string; npub: string }
  getPrivateIdentity(): { skHex: string; nsec: string }

  // network
  publish(event: Pick<Event, 'kind' | 'content' | 'tags'>): Promise<string>
  subscribe(filter: Filter, opts: { onevent: (evt: Event) => void; oneose?: () => void; onclose?: (reasons: string[]) => void }): () => void
  getRelays(): string[]
  setRelays(relays: string[]): void

  // local moderation
  getMutedTerms(): string[]
  setMutedTerms(terms: string[]): void
  getBlockedPubkeys(): string[]
  setBlockedPubkeys(pubkeys: string[]): void

  // local feed prefs (local-only app)
  getLocalRadiusKm(): number | undefined
  setLocalRadiusKm(km: number): void

  // optional media upload (local-only setting)
  getMediaUploadEndpoint(): string | undefined
  setMediaUploadEndpoint(endpoint: string | null): void

  // direct messages (DMs)
  sendDM(recipientPubkey: string, content: string): Promise<string>
  decryptDM(event: Event): Promise<string>
  getConversations(): Promise<Conversation[]>
  getDMsWith(pubkey: string): Promise<DecryptedDM[]>

  // profile metadata (kind 0)
  updateProfile(metadata: { name?: string; picture?: string }): Promise<string>
  getMyProfile(): Promise<{ name?: string; picture?: string } | null>
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

function loadState(): StoredStateV1 {
  return loadJson<StoredStateV1>(LS_KEY, { mutedTerms: [], blockedPubkeys: [] })
}

function saveState(patch: Partial<StoredStateV1>) {
  const next = { ...loadState(), ...patch }
  saveJson(LS_KEY, next)
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

  function getRelays(): string[] {
    const s = loadState()
    const stored = s.settings?.relays
    if (Array.isArray(stored)) {
      const norm = normalizeRelays(stored)
      if (norm.length) return norm
    }
    return [...DEFAULT_RELAYS]
  }

  function setRelays(relays: string[]) {
    const norm = normalizeRelays(relays)
    const s = loadState()
    saveState({ settings: { ...s.settings, relays: norm } })
    resubscribeAll('relays-changed')
  }

  function startOrRestartSub(s: ActiveSub, reason: string) {
    try {
      s.closer?.close(`brezn:${reason}`)
    } catch {
      // ignore
    }
      const relays = getRelays()
      s.closer = pool.subscribeMany(relays, s.filter, {
        onevent: evt => {
          s.opts.onevent(evt)
        },
        oneose: () => {
          s.opts.oneose?.()
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

  // best-effort: when user returns to tab or network comes back, restart subs
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') resubscribeAll('app-visible')
    })
    window.addEventListener('online', () => resubscribeAll('online'))
  }

  function ensureIdentity(): { skHex: string; pubkey: string; npub: string } {
    const s = loadState()
    let skHex = s.skHex
    if (!skHex) {
      const sk = generateSecretKey()
      skHex = bytesToHex(sk)
      const pubkey = getPublicKey(sk)
      const npub = nip19.npubEncode(pubkey)
      saveState({ skHex, pubkey, npub })
      return { skHex, pubkey, npub }
    }
    const pubkey = getPublicKey(hexToBytes(skHex))
    const npub = nip19.npubEncode(pubkey)
    if (s.pubkey !== pubkey || s.npub !== npub) saveState({ pubkey, npub })
    return { skHex, pubkey, npub }
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
    startOrRestartSub(s, 'subscribe')
    return () => {
      activeSubs.delete(id)
      try {
        s.closer?.close('ui-unsubscribe')
      } catch {
        // ignore
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

  function setBlockedPubkeys(pubkeys: string[]) {
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
    saveState({ blockedPubkeys: normalized })
  }

  function getLocalRadiusKm(): number | undefined {
    const v = loadState().settings?.localRadiusKm
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.round(v)
    return undefined
  }

  function setLocalRadiusKm(km: number) {
    const clamped = Math.max(1, Math.min(LOCAL_RADIUS_MAX_KM, Math.round(km)))
    const s = loadState()
    saveState({ settings: { ...s.settings, localRadiusKm: clamped } })
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

                let preview = '[verschlüsselt]'
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

                let preview = '[verschlüsselt]'
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
    getLocalRadiusKm,
    setLocalRadiusKm,
    getMediaUploadEndpoint,
    setMediaUploadEndpoint,
    sendDM,
    decryptDM,
    getConversations,
    getDMsWith,
    updateProfile,
    getMyProfile,
  }
}

