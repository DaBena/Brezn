import { useCallback, useState } from 'react'
import type { BreznNostrClient } from '../lib/nostrClient'

export function useFollows(client: BreznNostrClient) {
  const [followedPubkeys, setFollowedPubkeysState] = useState<string[]>(() =>
    client.getFollowedPubkeys(),
  )

  const refreshFromClient = useCallback(() => {
    setFollowedPubkeysState(client.getFollowedPubkeys())
  }, [client])

  const follow = useCallback(
    (pubkey: string) => {
      client.setFollowedPubkeys([...client.getFollowedPubkeys(), pubkey])
      setFollowedPubkeysState(client.getFollowedPubkeys())
    },
    [client],
  )

  const unfollow = useCallback(
    (pubkey: string) => {
      const pk = pubkey.trim().toLowerCase()
      client.setFollowedPubkeys(client.getFollowedPubkeys().filter((p) => p.toLowerCase() !== pk))
      setFollowedPubkeysState(client.getFollowedPubkeys())
    },
    [client],
  )

  const isFollowed = useCallback(
    (pubkey: string) =>
      followedPubkeys.some((p) => p.toLowerCase() === pubkey.trim().toLowerCase()),
    [followedPubkeys],
  )

  return {
    followedPubkeys,
    follow,
    unfollow,
    isFollowed,
    refreshFromClient,
  }
}
