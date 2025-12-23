import { useMemo } from 'react'
import { createNostrClient } from '../lib/nostrClient'

export function useNostrClient() {
  // Create once per app lifetime.
  return useMemo(() => createNostrClient(), [])
}

