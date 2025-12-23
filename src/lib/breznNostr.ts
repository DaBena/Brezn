export const BREZN_CLIENT_NAME = 'brezn'

export function breznClientTag(): string[] {
  return ['client', BREZN_CLIENT_NAME]
}

export const NOSTR_KINDS = {
  metadata: 0,
  note: 1,
  deletion: 5,
  reaction: 7,
} as const

