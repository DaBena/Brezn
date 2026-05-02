import Dexie, { type EntityTable } from 'dexie'
import type { Event } from 'nostr-tools'

export type ProfileMetadataRow = {
  pubkey: string
  content: string
  createdAt: number
  storedAt: number
}

export const PROFILE_METADATA_CACHE_MAX_ROWS = 2500

export function mergeKind0IntoCacheRow(
  existing: ProfileMetadataRow | undefined,
  evt: Pick<Event, 'kind' | 'pubkey' | 'created_at' | 'content'>,
  nowMs: number,
): ProfileMetadataRow | null {
  if (evt.kind !== 0) return null
  const content = evt.content ?? '{}'
  if (existing) {
    if (existing.createdAt > evt.created_at) return null
    if (existing.createdAt === evt.created_at && existing.content === content) {
      return { ...existing, storedAt: nowMs }
    }
  }
  return {
    pubkey: evt.pubkey,
    content,
    createdAt: evt.created_at,
    storedAt: nowMs,
  }
}

class ProfileMetadataDexie extends Dexie {
  profiles!: EntityTable<ProfileMetadataRow, 'pubkey'>
  constructor() {
    super('brezn-profile-metadata-v1')
    this.version(1).stores({
      profiles: 'pubkey, storedAt',
    })
  }
}

let dbSingleton: ProfileMetadataDexie | null = null

function getDb(): ProfileMetadataDexie {
  if (!dbSingleton) dbSingleton = new ProfileMetadataDexie()
  return dbSingleton
}

export async function profileMetadataCacheReadMany(
  pubkeys: string[],
): Promise<Map<string, ProfileMetadataRow>> {
  const out = new Map<string, ProfileMetadataRow>()
  if (!pubkeys.length) return out
  const db = getDb()
  const rows = await db.profiles.where('pubkey').anyOf(pubkeys).toArray()
  for (const r of rows) {
    out.set(r.pubkey, r)
  }
  return out
}

async function pruneOldestIfNeeded(): Promise<void> {
  const db = getDb()
  const n = await db.profiles.count()
  if (n <= PROFILE_METADATA_CACHE_MAX_ROWS) return
  const excess = n - PROFILE_METADATA_CACHE_MAX_ROWS
  const keys = await db.profiles.orderBy('storedAt').limit(excess).primaryKeys()
  if (keys.length) await db.profiles.bulkDelete(keys)
}

export async function profileMetadataCacheUpsertFromKind0(evt: Event): Promise<void> {
  if (evt.kind !== 0) return
  const db = getDb()
  const nowMs = Date.now()
  const existing = await db.profiles.get(evt.pubkey)
  const next = mergeKind0IntoCacheRow(existing, evt, nowMs)
  if (!next) return
  await db.profiles.put(next)
  await pruneOldestIfNeeded()
}
