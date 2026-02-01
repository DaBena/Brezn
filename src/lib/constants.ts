/**
 * Shared constants for Brezn.
 * Centralizes timeouts, limits, and magic numbers for easier tuning and documentation.
 */

/** Time to wait for initial feed EOSE before showing "timed out" (ms). */
export const FEED_INITIAL_LOAD_TIMEOUT_MS = 12_500

/** Cooldown before resending NIP-09 deletion for own notes (ms). */
export const RESEND_DELETION_COOLDOWN_MS = 10_000

/** Minimum number of posts before we skip auto-backfill. */
export const FEED_INITIAL_MIN_POSTS = 7

/** Max auto-backfill attempts per geo-query. */
export const FEED_AUTO_BACKFILL_MAX_ATTEMPTS = 3

/** Relay query limit for feed subscriptions (kind 1 and 20000). */
export const FEED_QUERY_LIMIT = 200

/** Max events to keep in offline feed cache. */
export const FEED_CACHE_MAX_EVENTS = 200

/** Number of posts shown initially before "Load more". */
export const FEED_INITIAL_DISPLAY_LIMIT = 7
