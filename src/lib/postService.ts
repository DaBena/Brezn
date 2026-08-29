import type { Event } from './nostrPrimitives'
import type { BreznNostrClient } from './nostrClient'
import { NOSTR_KINDS } from './breznNostr'
import { generateGeohashTags } from './geo'

function createGeoTags(geohash: string): [string, string][] {
  return generateGeohashTags(geohash).map((g) => ['g', g] as [string, string])
}

/**
 * @param viewerGeo5 - Saved viewer cell (required for default geotags).
 * @param publishGeohash - Optional override for this post only; does not change viewer location.
 */
export async function publishPost(
  client: BreznNostrClient,
  content: string,
  viewerGeo5: string | null,
  publishGeohash?: string | null,
): Promise<void> {
  const geo = (publishGeohash ?? viewerGeo5)?.trim() || null
  if (!geo) throw new Error('Location missing (reload feed).')

  const geoTags = createGeoTags(geo)

  await client.publish({
    kind: NOSTR_KINDS.note,
    content,
    tags: [...geoTags],
  })
}

export async function publishReply(
  client: BreznNostrClient,
  root: Event,
  content: string,
): Promise<void> {
  const trimmedContent = content.trim()
  if (!trimmedContent) return

  const tags: string[][] = [
    // NIP-10 threading (reply-to == root in our UI)
    ['e', root.id, '', 'root'],
    ['e', root.id, '', 'reply'],
    ['p', root.pubkey],
  ]

  // No `g` tags — replies are private to the thread (like DMs), not geo-discoverable.
  await client.publish({ kind: 1, content: trimmedContent, tags })
}

export async function deletePost(
  client: BreznNostrClient,
  evt: Event,
  identityPubkey: string,
): Promise<void> {
  await deletePosts(client, [evt], identityPubkey)
}

export async function deletePosts(
  client: BreznNostrClient,
  events: Event[],
  identityPubkey: string,
): Promise<void> {
  const ownEvents = events.filter(Boolean)
  if (!ownEvents.length) return
  for (const evt of ownEvents) {
    if (evt.pubkey !== identityPubkey) {
      throw new Error('Only your own posts can be marked with a deletion event.')
    }
  }
  const ids = [...new Set(ownEvents.map((evt) => evt.id))]
  if (!ids.length) return
  // NIP-09: Event Deletion (kind 5), supports deleting multiple events in one request.
  const tags = ids.map((id) => ['e', id] as [string, string])
  await client.publish({
    kind: NOSTR_KINDS.deletion,
    content: '',
    tags,
  })
}
