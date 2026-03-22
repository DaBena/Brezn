import { useEffect, useMemo, useRef, useState } from 'react'
import type { Filter } from 'nostr-tools'
import type { BreznNostrClient } from '../lib/nostrClient'
import { loadStoredProfiles, saveStoredProfiles } from '../lib/profileCache'

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

  const limitedPubkeys = useMemo(() => Array.from(new Set(pubkeys)).slice(0, 500), [pubkeys])
  const pubkeyKey = limitedPubkeys.join(',')
  const activeKey = pubkeyKey

  const initialDisk = useMemo(() => loadStoredProfiles(), [])
  const latestDiskForSaveRef = useRef<Map<string, Profile>>(initialDisk)
  const saveTimerRef = useRef<number | undefined>(undefined)

  const [state, setState] = useState<{
    key: string
    live: Map<string, Profile>
    disk: Map<string, Profile>
  }>({
    key: '',
    live: new Map(),
    disk: initialDisk,
  })

  const seenMetadataIdsRef = useRef<Set<string>>(new Set())
  const latestKind0TimeRef = useRef<Map<string, number>>(new Map())
  const scopeKeyRef = useRef<string>('')

  function scheduleSaveDisk(): void {
    if (typeof window === 'undefined') return
    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = undefined
      saveStoredProfiles(latestDiskForSaveRef.current)
    }, 600)
  }

  useEffect(() => {
    if (isOffline) return
    if (!pubkeyKey) return

    const pubkeySet = new Set(limitedPubkeys)

    if (scopeKeyRef.current !== activeKey) {
      scopeKeyRef.current = activeKey
      seenMetadataIdsRef.current = new Set()
      latestKind0TimeRef.current = new Map()
    }

    const filter: Filter = { kinds: [0], authors: limitedPubkeys, limit: 500 }

    const unsub = client.subscribe(filter, {
      onevent: evt => {
        if (evt.kind !== 0) return
        if (!pubkeySet.has(evt.pubkey)) return
        if (seenMetadataIdsRef.current.has(evt.id)) return

        const prevBest = latestKind0TimeRef.current.get(evt.pubkey) ?? 0
        if (evt.created_at < prevBest) return

        seenMetadataIdsRef.current.add(evt.id)
        latestKind0TimeRef.current.set(evt.pubkey, Math.max(prevBest, evt.created_at))

        const parsed = parseMetadata(evt.content ?? '')
        setState(prevState => {
          const base = prevState.key === activeKey ? prevState.live : new Map()
          const prev = base.get(evt.pubkey)
          const merged: Profile = {
            pubkey: evt.pubkey,
            name: parsed.name ?? prev?.name,
            picture: parsed.picture ?? prev?.picture,
            about: parsed.about ?? prev?.about,
          }
          if (!merged.name && !merged.picture && !merged.about) return prevState
          const nextLive = new Map(base)
          nextLive.set(evt.pubkey, merged)
          const nextDisk = new Map(prevState.disk)
          nextDisk.set(evt.pubkey, merged)
          latestDiskForSaveRef.current = nextDisk
          scheduleSaveDisk()
          return { key: activeKey, live: nextLive, disk: nextDisk }
        })
      },
    })

    return () => unsub()
  }, [client, isOffline, activeKey, pubkeyKey, limitedPubkeys])

  const profilesByPubkey = useMemo(() => {
    const live = state.key === activeKey ? state.live : new Map<string, Profile>()
    const disk = state.disk
    const out = new Map<string, Profile>()
    for (const pk of limitedPubkeys) {
      const L = live.get(pk)
      const D = disk.get(pk)
      if (!L && !D) continue
      if (!L) {
        out.set(pk, { pubkey: pk, name: D?.name, picture: D?.picture, about: D?.about })
        continue
      }
      if (!D) {
        out.set(pk, L)
        continue
      }
      out.set(pk, {
        pubkey: pk,
        name: L.name ?? D.name,
        picture: L.picture ?? D.picture,
        about: L.about ?? D.about,
      })
    }
    return out
  }, [state, activeKey, limitedPubkeys])

  return { profilesByPubkey }
}
