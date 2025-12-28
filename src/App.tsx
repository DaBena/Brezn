import { useMemo, useState } from 'react'
import type { Event } from 'nostr-tools'
import { ComposerSheet } from './components/ComposerSheet'
import { ConversationsSheet } from './components/ConversationsSheet'
import { DMSheet } from './components/DMSheet'
import { Feed } from './components/Feed'
import { PwaUpdateToast } from './components/PwaUpdateToast'
import { AdblockerWarning } from './components/AdblockerWarning'
import { SettingsSheet } from './components/SettingsSheet'
import { ThreadSheet } from './components/ThreadSheet'
import { useToast } from './components/Toast'
import { useIdentity } from './hooks/useIdentity'
import { useLocalFeed } from './hooks/useLocalFeed'
import { useNostrClient } from './hooks/useNostrClient'
import { useReactions } from './hooks/useReactions'
import { breznClientTag, NOSTR_KINDS } from './lib/breznNostr'
import { generateGeohashTags } from './lib/geo'

export default function App() {
  const client = useNostrClient()
  const { identity } = useIdentity(client)
  const { showToast } = useToast()

  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [threadRoot, setThreadRoot] = useState<Event | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [dmOpen, setDmOpen] = useState(false)
  const [dmTargetPubkey, setDmTargetPubkey] = useState<string | null>(null)
  const [mutedTerms, setMutedTerms] = useState<string[]>(() => client.getMutedTerms())
  const [blockedPubkeys, setBlockedPubkeys] = useState<string[]>(() => client.getBlockedPubkeys())
  const [optimisticReactedByNoteId, setOptimisticReactedByNoteId] = useState<Record<string, true>>({})

  const {
    feedState,
    requestLocationAndLoad,
    geoCell,
    viewerGeo5, // Full 5-digit geohash for posting
    sortedEvents,
    viewerPoint,
    geohashLength,
    initialTimedOut,
    lastCloseReasons,
    isLoadingMore,
    loadMore,
    isOffline,
    applyGeohashLength,
  } = useLocalFeed({ client, mutedTerms, blockedPubkeys })

  const { reactionsByNoteId } = useReactions({
    client,
    noteIds: sortedEvents.map(e => e.id),
    viewerPubkey: identity.pubkey,
    isOffline,
  })

  const mergedReactionsByNoteId = useMemo(() => {
    if (!Object.keys(optimisticReactedByNoteId).length) return reactionsByNoteId
    const merged: Record<string, { total: number; viewerReacted: boolean }> = { ...reactionsByNoteId }
    for (const noteId of Object.keys(optimisticReactedByNoteId)) {
      const cur = merged[noteId] ?? { total: 0, viewerReacted: false }
      merged[noteId] = { ...cur, viewerReacted: true }
    }
    return merged
  }, [optimisticReactedByNoteId, reactionsByNoteId])

  async function publishPost(content: string) {
    // Use full 5-digit geohash for posting (not the shortened geoCell)
    if (!viewerGeo5) throw new Error('Location missing (reload feed).')
    
    // Generiere alle Geohash-Tags (Präfixe 1-5) für maximale Auffindbarkeit
    // viewerGeo5 ist immer 5-stellig, daher werden alle Präfixe generiert
    const geoTags = generateGeohashTags(viewerGeo5).map(g => ['g', g] as [string, string])
    
    await client.publish({
      kind: NOSTR_KINDS.note,
      content,
      tags: [
        breznClientTag(),
        ...geoTags,
      ],
    })
  }

  async function publishReply(opts: { root: Event; content: string }) {
    const content = opts.content.trim()
    if (!content) return
    if (isOffline) throw new Error('Offline - Comments are read-only.')

    const root = opts.root
    const rootGeo = root.tags.find(t => t[0] === 'g' && typeof t[1] === 'string')?.[1] ?? null
    // Use full 5-digit geohash for replies (not the shortened geoCell)
    const g = rootGeo ?? viewerGeo5

    const tags: string[][] = [
      breznClientTag(),
      // NIP-10 threading (reply-to == root in our UI)
      ['e', root.id, '', 'root'],
      ['e', root.id, '', 'reply'],
      ['p', root.pubkey],
    ]
    
    // Generiere alle Geohash-Tags (Präfixe 1-5) für maximale Auffindbarkeit
    if (g) {
      const geoTags = generateGeohashTags(g).map(gh => ['g', gh] as [string, string])
      tags.push(...geoTags)
    }

    await client.publish({ kind: 1, content, tags })
  }

  async function reactToPost(evt: Event) {
    if (isOffline) return
    if (mergedReactionsByNoteId[evt.id]?.viewerReacted) return
    // Optimistically prevent double-like while relay echo is pending.
    setOptimisticReactedByNoteId(prev => (prev[evt.id] ? prev : { ...prev, [evt.id]: true }))
    try {
      await client.publish({
        kind: NOSTR_KINDS.reaction,
        content: '+',
        tags: [
          breznClientTag(),
          ['e', evt.id],
          ['p', evt.pubkey],
        ],
      })
    } catch (e) {
      setOptimisticReactedByNoteId(prev => {
        if (!prev[evt.id]) return prev
        const next = { ...prev }
        delete next[evt.id]
        return next
      })
      showToast(e instanceof Error ? e.message : 'Reaction failed.', 'error')
    }
  }

  async function deletePost(evt: Event) {
    if (isOffline) throw new Error('Offline - Deletion Event kann nicht gesendet werden.')
    if (evt.pubkey !== identity.pubkey) throw new Error('Only your own posts can be marked with a deletion event.')
    // NIP-09: Event Deletion (kind 5)
    await client.publish({
      kind: NOSTR_KINDS.deletion,
      content: '',
      tags: [
        breznClientTag(),
        ['e', evt.id],
      ],
    })
  }

  return (
    <div className="min-h-dvh bg-brezn-bg text-brezn-text">
      <PwaUpdateToast />
      <AdblockerWarning />
      <button
        type="button"
        onClick={() => setDmOpen(true)}
        aria-label="Open chat"
        className={[
          'fixed z-30',
          // Fallback for browsers that don't support env(safe-area-inset-*)
          'top-2 left-2',
          // Prefer safe-area positioning when supported
          'top-[calc(env(safe-area-inset-top)+0.25rem)] left-[calc(env(safe-area-inset-left)+0.25rem)]',
          // Keep a good tap-target, but no circular button chrome.
          'h-9 w-9 rounded-lg text-brezn-muted',
          'grid place-items-center hover:text-brezn-text',
          'focus:outline-none focus:ring-2 focus:ring-brezn-gold/40',
        ].join(' ')}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          aria-hidden="true"
          className="opacity-90"
        >
          <path
            fill="currentColor"
            d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
          />
        </svg>
      </button>

      <button
        type="button"
        onClick={() => setFilterOpen(true)}
        aria-label="Open menu"
        className={[
          'fixed z-30',
          // Fallback for browsers that don't support env(safe-area-inset-*)
          'top-2 right-2',
          // Prefer safe-area positioning when supported
          'top-[calc(env(safe-area-inset-top)+0.25rem)] right-[calc(env(safe-area-inset-right)+0.25rem)]',
          // Keep a good tap-target, but no circular button chrome.
          'h-9 w-9 rounded-lg text-brezn-muted',
          'grid place-items-center hover:text-brezn-text',
          'focus:outline-none focus:ring-2 focus:ring-brezn-gold/40',
        ].join(' ')}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          aria-hidden="true"
          className="opacity-90"
        >
          <path
            fill="currentColor"
            d="M4 7h16v2H4V7zm0 6h16v2H4v-2zm0 6h16v2H4v-2z"
          />
        </svg>
      </button>

      <Feed
        feedState={feedState}
        geoCell={geoCell}
        viewerPoint={viewerPoint}
        isOffline={isOffline}
        reactionsByNoteId={mergedReactionsByNoteId}
        canReact={!isOffline}
        events={sortedEvents}
        initialTimedOut={initialTimedOut}
        lastCloseReasons={lastCloseReasons}
        isLoadingMore={isLoadingMore}
        client={client}
        onRequestLocation={() => void requestLocationAndLoad({ forceBrowser: true })}
        onLoadMore={loadMore}
        onReact={evt => void reactToPost(evt)}
        onOpenThread={evt => {
          // Don't open thread if user is blocked
          if (!blockedPubkeys.includes(evt.pubkey)) {
            setThreadRoot(evt)
          }
        }}
      />

      {/* Always-visible compose button (esp. on mobile) */}
      <button
        type="button"
        onClick={() => setIsComposerOpen(true)}
        aria-label="Neuen Beitrag erstellen"
        className={[
          'fixed z-30',
          // Fallback for browsers that don't support env(safe-area-inset-*)
          'bottom-6 left-1/2 -translate-x-1/2',
          // Prefer safe-area positioning when supported
          'bottom-[calc(env(safe-area-inset-bottom)+1.5rem)]',
          'h-10 w-10 rounded-full',
          'bg-brezn-gold text-brezn-bg shadow-soft',
          'grid place-items-center',
          'hover:opacity-95 active:scale-[0.98]',
          // subtle ring around the button
          "before:content-[''] before:absolute before:-inset-2 before:rounded-full before:border before:border-brezn-gold/40 before:pointer-events-none",
        ].join(' ')}
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          aria-hidden="true"
          className="block"
        >
          <path
            d="M12 5v14M5 12h14"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <ComposerSheet
        open={isComposerOpen}
        onClose={() => setIsComposerOpen(false)}
        viewerGeo5={viewerGeo5}
        onPublish={publishPost}
        mediaUploadEndpoint={client.getMediaUploadEndpoint()}
      />

      {threadRoot ? (
        <ThreadSheet
          open
          root={threadRoot}
          client={client}
          mutedTerms={mutedTerms}
          blockedPubkeys={blockedPubkeys}
          isOffline={isOffline}
          viewerPoint={viewerPoint}
          onClose={() => setThreadRoot(null)}
          onPublishReply={content => void publishReply({ root: threadRoot, content })}
          onDelete={evt => void deletePost(evt)}
          onBlockUser={pubkey => {
            const next = [...blockedPubkeys, pubkey]
            client.setBlockedPubkeys(next)
            setBlockedPubkeys(client.getBlockedPubkeys())
          }}
        />
      ) : null}

      {filterOpen ? (
        <SettingsSheet
          open
          onClose={() => setFilterOpen(false)}
          client={client}
          onModerationChanged={() => {
            setMutedTerms(client.getMutedTerms())
            setBlockedPubkeys(client.getBlockedPubkeys())
          }}
          geohashLength={geohashLength}
          geoCell={geoCell}
          onGeohashLengthChange={applyGeohashLength}
        />
      ) : null}

      {dmOpen && dmTargetPubkey ? (
        <DMSheet
          open={dmOpen}
          onClose={() => {
            setDmOpen(false)
            setDmTargetPubkey(null)
          }}
          client={client}
          otherPubkey={dmTargetPubkey}
        />
      ) : dmOpen ? (
        <ConversationsSheet open={dmOpen} onClose={() => setDmOpen(false)} client={client} />
      ) : null}
    </div>
  )
}


