export function breznClientTag(): string[] {
  return ['client', 'brezn']
}

export const NOSTR_KINDS = {
  metadata: 0,
  note: 1,
  deletion: 5,
  reaction: 7,
  report: 1984, // NIP-56: Reporting content
} as const

