import { useMemo } from 'react'
import type { BreznNostrClient } from '../lib/nostrClient'

export function useIdentity(client: BreznNostrClient) {
  const identity = useMemo(() => client.getPublicIdentity(), [client])
  return { identity }
}

