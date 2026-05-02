/** Brezn: timeouts, limits, tunables. */

/** NIP-09 resend cooldown for own deletions (ms). */
export const RESEND_DELETION_COOLDOWN_MS = 10_000

/** Min posts before auto-backfill stops. */
export const FEED_INITIAL_MIN_POSTS = 7

/** Max auto-backfill rounds per geo cell. */
export const FEED_AUTO_BACKFILL_MAX_ATTEMPTS = 3

/** Relay page size (kind 1). */
export const FEED_QUERY_LIMIT = 200

/** Main feed subscription: max delay before flushing batched relay events (ms). */
export const FEED_SUBSCRIPTION_BATCH_MAX_MS = 80

/** Rows revealed per tap (client windowing); relay batching is FEED_QUERY_LIMIT. */
export const FEED_RENDER_CHUNK = 7

/** Max flow-text length before “…” in feed/profile card previews. */
export const FEED_PREVIEW_MAX_FLOWTEXT = 280

/** While search is debounced: max `loadMorePage` rounds (each ≤ FEED_QUERY_LIMIT); empty pages advance `until` by span. */
export const SEARCH_FEED_PREFETCH_MAX_ROUNDS = 10

/** localStorage: last geo cell; key exists ⇒ user saw consent and allowed location once. */
export const LAST_LOCATION_KEY = 'brezn:last-location:v1'

/** DM fetch per relay: nostr-tools `maxWait` for EOSE on that connection. */
export const GET_DM_HISTORY_MAX_WAIT_MS = 5_000

/** Per-relay DM fetch: close and continue if `oneose` never fires (parallel across relays). */
export const GET_DM_HISTORY_TIMEOUT_MS = 8_000

/**
 * `getConversations` / `getDMsWith` (partial fetch): shorter per-relay cap so a dead relay releases faster;
 * `onProgress` fires as each relay completes (first paint does not wait for the slowest).
 */
export const GET_DM_PARTIAL_PER_RELAY_TIMEOUT_MS = 4_500

/** DM list / chat sheet: safety net if the fetch promise never settles (should exceed per-relay timeout). */
export const GET_CONVERSATIONS_UI_TIMEOUT_MS = 9_000

/** Default `maxWait` for `pool.subscribeMany` / grouped subs (nostr-tools EOSE per relay). */
export const SUBSCRIBE_DEFAULT_MAX_WAIT_MS = 12_000

/** `getMyProfile`: give up if kind 0 never arrives. */
export const GET_MY_PROFILE_FETCH_TIMEOUT_MS = 3_000

/** Identity / encrypted key init before `ensureIdentity()` is reliable. */
export const IDENTITY_INIT_TIMEOUT_MS = 5_000

/** Settings “Test” button: WebSocket open probe per relay. */
export const RELAY_WEBSOCKET_TEST_TIMEOUT_MS = 3_500

/** Repo URL. */
export const REPO_URL = 'https://github.com/dabena/Brezn'
