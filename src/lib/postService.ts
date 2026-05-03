import type { Event } from './nostrPrimitives'
import type { BreznNostrClient } from './nostrClient'
import { NOSTR_KINDS } from './breznNostr'
import { generateGeohashTags } from './geo'

function createGeoTags(geohash: string): [string, string][] {
  return generateGeohashTags(geohash).map((g) => ['g', g] as [string, string])
}

export async function publishPost(
  client: BreznNostrClient,
  content: string,
  viewerGeo5: string | null,
): Promise<void> {
  // Use full 5-digit geohash for posting (not the shortened geoCell)
  if (!viewerGeo5) throw new Error('Location missing (reload feed).')

  // Generate all geohash tags (prefixes 1-5) for maximum discoverability
  // viewerGeo5 is always 5 digits, so all prefixes are generated
  const geoTags = createGeoTags(viewerGeo5)

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
  viewerGeo5: string | null,
): Promise<void> {
  const trimmedContent = content.trim()
  if (!trimmedContent) return

  const rootGeo = root.tags.find((t) => t[0] === 'g' && typeof t[1] === 'string')?.[1] ?? null
  // Use full 5-digit geohash for replies (not the shortened geoCell)
  const g = rootGeo ?? viewerGeo5

  const tags: string[][] = [
    // NIP-10 threading (reply-to == root in our UI)
    ['e', root.id, '', 'root'],
    ['e', root.id, '', 'reply'],
    ['p', root.pubkey],
  ]

  // Generate all geohash tags (prefixes 1-5) for maximum discoverability
  if (g) {
    const geoTags = createGeoTags(g)
    tags.push(...geoTags)
  }

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
