/**
 * NIP-01 wire shapes used across Brezn (aligned with what `NDKEvent.rawEvent()` returns).
 * Kept local so the app does not depend on `nostr-tools` for types.
 */
export type Event = {
  kind: number
  tags: string[][]
  content: string
  created_at: number
  pubkey: string
  id: string
  sig: string
}

/** NIP-01 REQ filter (single-letter tag keys use `#x` form). */
export type Filter = {
  ids?: string[]
  kinds?: number[]
  authors?: string[]
  since?: number
  until?: number
  limit?: number
  search?: string
} & {
  [tag: `#${string}`]: string[] | undefined
}
