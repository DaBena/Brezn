export const NOSTR_KINDS = {
  metadata: 0,
  note: 1,
  /** Legacy encrypted DM (NIP-04). Unrecommended; Brezn still reads these. */
  encryptedDm: 4,
  deletion: 5,
  reaction: 7,
  /** NIP-59 seal (inside gift wrap). */
  giftSeal: 13,
  /** NIP-17 chat rumor (never published plaintext). */
  privateDm: 14,
  report: 1984, // NIP-56: Reporting content
  /** NIP-17 preferred DM inbox relays. */
  dmRelays: 10050,
  /** NIP-59 gift wrap (published NIP-17 envelope). */
  giftWrap: 1059,
  /** NIP-52 calendar events (read-only in Brezn feed). */
  nip52DateEvent: 31922,
  nip52TimeEvent: 31923,
} as const

/** Kind-1 roots + NIP-52 for local geo feed and author profile list. */
export const ROOT_FEED_EVENT_KINDS = [
  NOSTR_KINDS.note,
  NOSTR_KINDS.nip52DateEvent,
  NOSTR_KINDS.nip52TimeEvent,
] as const
