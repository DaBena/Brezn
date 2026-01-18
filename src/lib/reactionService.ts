import type { Event } from 'nostr-tools'
import type { BreznNostrClient } from './nostrClient'
import { breznClientTag, NOSTR_KINDS } from './breznNostr'

export async function reactToPost(
  client: BreznNostrClient,
  evt: Event,
  _identityPubkey: string,
  onSuccess?: () => void,
  onError?: (error: Error) => void
): Promise<void> {
  try {
    await client.publish({
      kind: NOSTR_KINDS.reaction,
      content: '+',
      tags: [breznClientTag(), ['e', evt.id], ['p', evt.pubkey]],
    })
    onSuccess?.()
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Reaction failed.')
    onError?.(err)
    throw err
  }
}
