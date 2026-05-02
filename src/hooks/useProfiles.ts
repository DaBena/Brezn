import { useEffect, useMemo, useRef, useState } from 'react'
import type { Filter } from 'nostr-tools'
import type { BreznNostrClient } from '../lib/nostrClient'
import {
  profileMetadataCacheReadMany,
  profileMetadataCacheUpsertFromKind0,
} from '../lib/profileMetadataCache'

export type Profile = {
  pubkey: string
  name?: string
  picture?: string
  about?: string
}

function parseMetadata(content: string): { name?: string; picture?: string; about?: string } {
  try {
    const data = JSON.parse(content)
    return {
      name: typeof data.name === 'string' ? data.name.trim() : undefined,
      picture: typeof data.picture === 'string' ? data.picture.trim() : undefined,
      about: typeof data.about === 'string' ? data.about.trim() : undefined,
    }
  } catch {
    return {}
  }
}

export function useProfiles(params: {
  client: BreznNostrClient
  pubkeys: string[]
  isOffline: boolean
}) {
  const { client, pubkeys, isOffline } = params

  // Same multiset must produce the same key even if `pubkeys` order changes each render.
  const pubkeyKey = [...new Set(pubkeys)].sort().join(',')
  const limitedPubkeys = useMemo(
    () => (pubkeyKey ? pubkeyKey.split(',').filter(Boolean).slice(0, 500) : []),
    [pubkeyKey],
  )
  const activeKey = pubkeyKey

  const [state, setState] = useState<{ key: string; map: Map<string, Profile> }>({
    key: '',
    map: new Map(),
  })

  const seenMetadataIdsRef = useRef<Set<string>>(new Set())
  const latestKind0TimeRef = useRef<Map<string, number>>(new Map())
  const scopeKeyRef = useRef<string>('')

  useEffect(() => {
    if (!pubkeyKey) return

    const pubkeySet = new Set(limitedPubkeys)

    if (scopeKeyRef.current !== activeKey) {
      scopeKeyRef.current = activeKey
      seenMetadataIdsRef.current = new Set()
      latestKind0TimeRef.current = new Map()
    }

    let cancelled = false

    void profileMetadataCacheReadMany(limitedPubkeys).then((rows) => {
      if (cancelled) return
      const toMerge: Profile[] = []
      for (const pk of limitedPubkeys) {
        const row = rows.get(pk)
        if (!row) continue
        const prevBest = latestKind0TimeRef.current.get(pk) ?? 0
        if (row.createdAt < prevBest) continue
        latestKind0TimeRef.current.set(pk, Math.max(prevBest, row.createdAt))
        const parsed = parseMetadata(row.content)
        const merged: Profile = {
          pubkey: pk,
          name: parsed.name,
          picture: parsed.picture,
          about: parsed.about,
        }
        if (!merged.name && !merged.picture && !merged.about) continue
        toMerge.push(merged)
      }
      if (toMerge.length === 0) return
      setState((prevState) => {
        const base = prevState.key === activeKey ? prevState.map : new Map()
        const next = new Map(base)
        for (const p of toMerge) {
          next.set(p.pubkey, p)
        }
        return { key: activeKey, map: next }
      })
    })

    if (isOffline) {
      return () => {
        cancelled = true
      }
    }

    const filter: Filter = { kinds: [0], authors: limitedPubkeys, limit: 500 }

    const unsub = client.subscribe(filter, {
      onevent: (evt) => {
        if (evt.kind !== 0) return
        if (!pubkeySet.has(evt.pubkey)) return
        if (seenMetadataIdsRef.current.has(evt.id)) return

        const prevBest = latestKind0TimeRef.current.get(evt.pubkey) ?? 0
        if (evt.created_at < prevBest) return

        seenMetadataIdsRef.current.add(evt.id)
        latestKind0TimeRef.current.set(evt.pubkey, Math.max(prevBest, evt.created_at))

        void profileMetadataCacheUpsertFromKind0(evt).catch(() => {})

        const parsed = parseMetadata(evt.content ?? '')
        setState((prevState) => {
          const base = prevState.key === activeKey ? prevState.map : new Map()
          const prev = base.get(evt.pubkey)
          const merged: Profile = {
            pubkey: evt.pubkey,
            name: parsed.name ?? prev?.name,
            picture: parsed.picture ?? prev?.picture,
            about: parsed.about ?? prev?.about,
          }
          if (!merged.name && !merged.picture && !merged.about) return prevState
          const next = new Map(base)
          next.set(evt.pubkey, merged)
          return { key: activeKey, map: next }
        })
      },
    })

    return () => {
      cancelled = true
      unsub()
    }
  }, [client, isOffline, activeKey, limitedPubkeys, pubkeyKey])

  const profilesByPubkey = useMemo(() => {
    const map = state.key === activeKey ? state.map : new Map<string, Profile>()
    const out = new Map<string, Profile>()
    const pkList = pubkeyKey ? pubkeyKey.split(',').filter(Boolean).slice(0, 500) : []
    for (const pk of pkList) {
      const p = map.get(pk)
      if (p) out.set(pk, p)
    }
    return out
  }, [state, activeKey, pubkeyKey])

  return { profilesByPubkey }
}
