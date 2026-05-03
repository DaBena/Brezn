import type { NDKEvent } from '@nostr-dev-kit/ndk'
import type { Event } from './nostrPrimitives'

/**
 * Map an NDK subscription event to the plain Nostr event shape the rest of Brezn expects.
 * Uses `rawEvent()` (no field-by-field copy) so the hot path stays cheap.
 */
export function ndkEventToBreznEvent(e: NDKEvent): Event {
  return e.rawEvent() as Event
}
