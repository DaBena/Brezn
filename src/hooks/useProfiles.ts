import { useEffect, useMemo, useRef, useState } from 'react'
import type { Filter } from 'nostr-tools'
import type { BreznNostrClient } from '../lib/nostrClient'

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

  const [state, setState] = useState<{ key: string; profiles: Map<string, Profile> }>({
    key: '',
    profiles: new Map(),
  })
  const seenMetadataIdsRef = useRef<Set<string>>(new Set())
  const scopeKeyRef = useRef<string>('')

  useEffect(() => {
    if (isOffline) return
    if (!pubkeyKey) return

    const pubkeySet = new Set(limitedPubkeys)

    // Only reset when the query scope changes
    if (scopeKeyRef.current !== activeKey) {
      scopeKeyRef.current = activeKey
      seenMetadataIdsRef.current = new Set()
    }

    const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30 // last 30d
    const filter: Filter = { kinds: [0], authors: limitedPubkeys, since, limit: 500 }

    const unsub = client.subscribe(filter, {
      onevent: evt => {
        if (evt.kind !== 0) return
        if (!pubkeySet.has(evt.pubkey)) return
        if (seenMetadataIdsRef.current.has(evt.id)) return

        seenMetadataIdsRef.current.add(evt.id)

        const parsed = parseMetadata(evt.content ?? '')
        setState(prevState => {
          const base = prevState.key === activeKey ? prevState.profiles : new Map()
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
          return { key: activeKey, profiles: next }
        })
      },
    })

    return () => unsub()
  }, [client, isOffline, activeKey, pubkeyKey, limitedPubkeys])

  const profilesByPubkey = state.key === activeKey ? state.profiles : new Map<string, Profile>()
  return { profilesByPubkey }
}

