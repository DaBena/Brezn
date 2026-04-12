import type { BreznNostrClient } from '../lib/nostrClient'

export function useIdentity(client: BreznNostrClient) {
  // Must not cache on [client] only: after IndexedDB decrypt, pubkey updates without a new client instance.
  const identity = client.getPublicIdentity()
  return { identity }
}

