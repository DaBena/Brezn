import { useState } from 'react'
import type { BreznNostrClient } from '../lib/nostrClient'

export function useModeration(client: BreznNostrClient) {
  const [mutedTerms, setMutedTerms] = useState<string[]>(() => client.getMutedTerms())
  const [blockedPubkeys, setBlockedPubkeys] = useState<string[]>(() => client.getBlockedPubkeys())

  const refreshFromClient = () => {
    setMutedTerms(client.getMutedTerms())
    setBlockedPubkeys(client.getBlockedPubkeys())
  }

  return {
    mutedTerms,
    blockedPubkeys,
    refreshFromClient,
  }
}
