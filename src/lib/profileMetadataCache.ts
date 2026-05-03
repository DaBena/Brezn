import Dexie, { type EntityTable } from 'dexie'
import type { Event } from './nostrPrimitives'

/** iOS Safari often kills IDB mid-flight; never surface these as fatal UI errors. */
function isRecoverableIndexedDbError(e: unknown): boolean {
  const name =
    e != null && typeof e === 'object' && 'name' in e && typeof (e as Error).name === 'string'
      ? (e as Error).name
      : ''
  const msg =
    e != null && typeof e === 'object' && 'message' in e && typeof (e as Error).message === 'string'
      ? String((e as Error).message)
      : String(e ?? '')
  if (
    name === 'TransactionInactiveError' ||
    name === 'InvalidStateError' ||
    name === 'AbortError'
  ) {
    return true
  }
  if (name === 'UnknownError') {
    return (
      msg.includes('Connection to Indexed Database server lost') ||
      msg.includes('internal error opening backing store')
    )
  }
  return (
    msg.includes('Connection to Indexed Database server lost') ||
    msg.includes('internal error opening backing store')
  )
}

async function resetProfileDb(): Promise<void> {
  const prev = dbSingleton
  dbSingleton = null
  if (!prev) return
  try {
    prev.close()
  } catch {
    /* ignore */
  }
  await new Promise<void>((r) => queueMicrotask(() => r()))
}

async function withIndexedDbRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (e) {
    if (!isRecoverableIndexedDbError(e)) throw e
    await resetProfileDb()
    return await run()
  }
}

/** Serialize writes: concurrent kind-0 upserts + prune caused TransactionInactiveError on iOS. */
let writeChain: Promise<void> = Promise.resolve()

function enqueueProfileWrite(task: () => Promise<void>): Promise<void> {
  const done = writeChain.then(task, task)
  writeChain = done.then(
    () => undefined,
    () => undefined,
  )
  return done
}

let pruneAfterWritesTimer: ReturnType<typeof setTimeout> | null = null

function scheduleDebouncedPrune(): void {
  if (pruneAfterWritesTimer !== null) clearTimeout(pruneAfterWritesTimer)
  pruneAfterWritesTimer = setTimeout(() => {
    pruneAfterWritesTimer = null
    void enqueueProfileWrite(async () => {
      try {
        await withIndexedDbRetry(() => pruneOldestIfNeeded())
      } catch {
        /* optional cache trim failure */
      }
    })
  }, 500)
}

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
  try {
    const rows = await withIndexedDbRetry(async () => {
      const db = getDb()
      return db.profiles.where('pubkey').anyOf(pubkeys).toArray()
    })
    for (const r of rows) {
      out.set(r.pubkey, r)
    }
  } catch {
    /* offline cache is optional */
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
  try {
    await enqueueProfileWrite(async () => {
      await withIndexedDbRetry(async () => {
        const db = getDb()
        const nowMs = Date.now()
        const existing = await db.profiles.get(evt.pubkey)
        const next = mergeKind0IntoCacheRow(existing, evt, nowMs)
        if (!next) return
        await db.profiles.put(next)
        scheduleDebouncedPrune()
      })
    })
  } catch {
    /* ignore cache write failures */
  }
}
