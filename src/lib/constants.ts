/** Brezn: timeouts, limits, tunables. */

/** NIP-09 resend cooldown for own deletions (ms). */
export const RESEND_DELETION_COOLDOWN_MS = 10_000

/** Min posts before auto-backfill stops. */
export const FEED_INITIAL_MIN_POSTS = 7

/** Max auto-backfill rounds per geo cell. */
export const FEED_AUTO_BACKFILL_MAX_ATTEMPTS = 3

/** Relay page size (kind 1). */
export const FEED_QUERY_LIMIT = 200

/** NIP-50 `search` page size (all configured relays). */
export const SEARCH_QUERY_LIMIT = 80

/** Characters kept before the first query match in a search card snippet. */
export const SEARCH_SNIPPET_LEAD = 80

/** Max followed pubkeys stored locally. */
export const FOLLOWED_PUBKEYS_MAX = 200

/** People rows shown in search (kind 0 hits can be noisy). */
export const SEARCH_PEOPLE_DISPLAY_MAX = 8

/** Max name-search profiles to probe for at least one root post. */
export const SEARCH_PEOPLE_PROBE_MAX = 24

/** Main feed subscription: max delay before flushing batched relay events (ms). */
export const FEED_SUBSCRIPTION_BATCH_MAX_MS = 80

/** Rows revealed per tap (client windowing); relay batching is FEED_QUERY_LIMIT. */
export const FEED_RENDER_CHUNK = 7

/** Max flow-text length before “…” in feed/profile card previews. */
export const FEED_PREVIEW_MAX_FLOWTEXT = 500

/** Kind-1 notes this long with almost no whitespace are dropped (base64 walls, dumps). */
export const UNSPACED_BLOB_MIN_LENGTH = 280

/** localStorage: last geo cell (expect `GEOHASH_LEN_MAX_UI` chars); feed/composer UX only — not IndexedDB consent. */
export const LAST_LOCATION_KEY = 'brezn:last-location:v1'

/** User opted into Brezn IndexedDB writes (GPS success or manual cell grant). Never inferred from geo alone. */
export const STORAGE_WRITE_CONSENT_KEY = 'brezn:storage-write-consent:v1'

/** One-shot migration for profiles that had geo-based unlock before explicit consent existed. */
export const STORAGE_WRITE_CONSENT_MIGRATION_KEY = 'brezn:migrated-storage-write-consent-v3'

/** Must match `nostrClient` LS_KEY — used for legacy migration checks only. */
export const BREZN_APP_STATE_LS_KEY = 'brezn:v1'

/** Per-relay DM fetch: close and continue if `oneose` never fires (parallel across relays). */
export const GET_DM_HISTORY_TIMEOUT_MS = 8_000

/**
 * `getConversations` / `getDMsWith` (partial fetch): shorter per-relay cap so a dead relay releases faster;
 * `onProgress` fires as each relay completes (first paint does not wait for the slowest).
 */
export const GET_DM_PARTIAL_PER_RELAY_TIMEOUT_MS = 4_500

/** DM list / chat sheet: safety net if the fetch promise never settles (should exceed per-relay timeout). */
export const GET_CONVERSATIONS_UI_TIMEOUT_MS = 9_000

/**
 * Peer DM plaintext slice used only for keyword blocklist matching in `getConversations`
 * (UI preview stays short; spam keywords often appear later in the body).
 */
export const DM_PEER_MODERATION_TEXT_MAX = 8192

/** `getMyProfile`: give up if kind 0 never arrives. */
export const GET_MY_PROFILE_FETCH_TIMEOUT_MS = 3_000

/** Identity / encrypted key init before `ensureIdentity()` is reliable. */
export const IDENTITY_INIT_TIMEOUT_MS = 5_000

/** Settings “Test” button: WebSocket open probe per relay. */
export const RELAY_WEBSOCKET_TEST_TIMEOUT_MS = 3_500

/** HTTP GET of the NIP-11 relay information document. */
export const NIP11_FETCH_TIMEOUT_MS = 2_500

/** Reuse a successful NIP-11 document this long. */
export const NIP11_CACHE_TTL_MS = 10 * 60_000

/** After a failed NIP-11 fetch, wait this long before retrying. */
export const NIP11_NEGATIVE_CACHE_TTL_MS = 60_000

/** Repo URL. */
export const REPO_URL = 'https://github.com/dabena/Brezn'
