/**
 * Empty relay page (no events): how far to move REQ `until` backward.
 * Uses feed time span (newest−oldest); if all same timestamp, uses now−oldest.
 */
function emptyPageBackstepSec(feedOldestCreated: number, feedNewestCreated: number): number {
  const intrinsicSpan = Math.max(0, feedNewestCreated - feedOldestCreated)
  if (intrinsicSpan > 0) return Math.max(1, intrinsicSpan)
  const nowSec = Math.floor(Date.now() / 1000)
  return Math.max(1, nowSec - feedOldestCreated)
}

function boundsFromFeedTimes(
  feedOldestCreated: number,
  feedNewestCreated: number,
): {
  lo: number
  hi: number
} {
  const lo = Math.min(feedOldestCreated, feedNewestCreated)
  const hi = Math.max(feedOldestCreated, feedNewestCreated)
  return { lo, hi }
}

/**
 * If a pagination batch merges no new notes, advance `until` so the next REQ does not repeat
 * the same window (duplicate-only vs. truly empty relay page).
 */
export function computeNextUntilCursor(params: {
  mergedNewCount: number
  requestUntil: number
  batchRelayCount: number
  batchMinCreated: number | null
  /** Feed time range before merge; drives empty-page `until` step. */
  feedOldestCreated: number
  feedNewestCreated: number
}): number | null {
  const {
    mergedNewCount,
    requestUntil,
    batchRelayCount,
    batchMinCreated,
    feedOldestCreated,
    feedNewestCreated,
  } = params
  if (mergedNewCount > 0) return null
  if (batchRelayCount > 0 && batchMinCreated !== null) {
    return batchMinCreated > 0 ? batchMinCreated - 1 : null
  }
  if (batchRelayCount === 0) {
    const { lo, hi } = boundsFromFeedTimes(feedOldestCreated, feedNewestCreated)
    const maxStep = requestUntil - 1
    if (maxStep < 1) return null
    const rawStep = emptyPageBackstepSec(lo, hi)
    const step = Math.max(1, Math.min(rawStep, maxStep))
    const next = requestUntil - step
    return next > 0 ? next : null
  }
  return null
}
