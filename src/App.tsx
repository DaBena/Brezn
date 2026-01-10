import { useMemo, useState, useEffect, useRef } from 'react'
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
import { useProfiles } from './hooks/useProfiles'
import { useReactions } from './hooks/useReactions'
import { breznClientTag, NOSTR_KINDS } from './lib/breznNostr'
import { generateGeohashTags } from './lib/geo'
import * as nip19 from 'nostr-tools/nip19'

export default function App() {
  const client = useNostrClient()
  const { identity } = useIdentity(client)
  const { showToast } = useToast()

  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [threadRoot, setThreadRoot] = useState<Event | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [dmOpen, setDmOpen] = useState(false)
  const [dmTargetPubkey, setDmTargetPubkey] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [showNav, setShowNav] = useState(true)
  const lastScrollY = useRef(0)
  const [mutedTerms, setMutedTerms] = useState<string[]>(() => client.getMutedTerms())
  const [blockedPubkeys, setBlockedPubkeys] = useState<string[]>(() => client.getBlockedPubkeys())
  const [optimisticReactedByNoteId, setOptimisticReactedByNoteId] = useState<Record<string, true>>(() => {
    // Load persisted reacted note IDs from localStorage
    try {
      const stored = localStorage.getItem('brezn:reacted')
      if (stored) {
        const parsed = JSON.parse(stored) as string[]
        return Object.fromEntries(parsed.map(id => [id, true]))
      }
    } catch {
      // Ignore errors
    }
    return {}
  })
  const reactedNoteIdsRef = useRef<Set<string>>(new Set(Object.keys(optimisticReactedByNoteId)))

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

  const noteIdsForReactions = useMemo(() => {
    const ids = [...sortedEvents.map(e => e.id)]
    if (threadRoot && !ids.includes(threadRoot.id)) {
      ids.push(threadRoot.id)
    }
    return ids
  }, [sortedEvents, threadRoot])

  const { reactionsByNoteId } = useReactions({
    client,
    noteIds: noteIdsForReactions,
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

  // Load profiles for search functionality
  const pubkeysForProfiles = useMemo(() => sortedEvents.map(e => e.pubkey), [sortedEvents])
  const { profilesByPubkey } = useProfiles({ client, pubkeys: pubkeysForProfiles, isOffline })

  // Debounce search query to avoid filtering on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const filteredEvents = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return sortedEvents
    const query = debouncedSearchQuery.toLowerCase().trim()
    return sortedEvents.filter(evt => {
      // Search in content
      const content = (evt.content ?? '').toLowerCase()
      if (content.includes(query)) return true

      // Search in pubkey (hex)
      if (evt.pubkey.toLowerCase().includes(query)) return true

      // Search in npub (bech32 encoded)
      try {
        const npub = nip19.npubEncode(evt.pubkey)
        if (npub.toLowerCase().includes(query)) return true
      } catch {
        // Ignore encoding errors
      }

      // Search in profile name
      const profile = profilesByPubkey.get(evt.pubkey)
      if (profile?.name) {
        const profileName = profile.name.toLowerCase()
        if (profileName.includes(query)) return true
      }

      return false
    })
  }, [sortedEvents, debouncedSearchQuery, profilesByPubkey])

  // Hide/show navigation on scroll
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      if (currentScrollY < 10) {
        // Always show at top
        setShowNav(true)
      } else if (currentScrollY > lastScrollY.current) {
        // Scrolling down - hide
        setShowNav(false)
      } else {
        // Scrolling up - show
        setShowNav(true)
      }
      lastScrollY.current = currentScrollY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  async function publishPost(content: string) {
    // Use full 5-digit geohash for posting (not the shortened geoCell)
    if (!viewerGeo5) throw new Error('Location missing (reload feed).')
    
    // Generate all geohash tags (prefixes 1-5) for maximum discoverability
    // viewerGeo5 is always 5 digits, so all prefixes are generated
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
    
    // Generate all geohash tags (prefixes 1-5) for maximum discoverability
    if (g) {
      const geoTags = generateGeohashTags(g).map(gh => ['g', gh] as [string, string])
      tags.push(...geoTags)
    }

    await client.publish({ kind: 1, content, tags })
  }

  // Persist reacted note IDs to localStorage
  useEffect(() => {
    const ids = Object.keys(optimisticReactedByNoteId)
    reactedNoteIdsRef.current = new Set(ids)
    try {
      localStorage.setItem('brezn:reacted', JSON.stringify(ids))
    } catch {
      // Ignore errors (localStorage might be full or disabled)
    }
  }, [optimisticReactedByNoteId])

  async function reactToPost(evt: Event) {
    if (isOffline) return
    // Check both merged reactions and persisted reacted note IDs
    if (mergedReactionsByNoteId[evt.id]?.viewerReacted || reactedNoteIdsRef.current.has(evt.id)) return
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
    if (isOffline) throw new Error('Offline - Deletion event cannot be sent.')
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
      <div className={[
        'fixed z-30 mx-auto flex w-full max-w-xl items-center gap-2 px-4 transition-all duration-200',
        // Fallback for browsers that don't support env(safe-area-inset-*)
        'left-1/2 -translate-x-1/2',
        // Prefer safe-area positioning when supported
        showNav 
          ? 'top-[calc(env(safe-area-inset-top)+0.25rem)] opacity-100 pointer-events-auto'
          : 'top-[-100%] opacity-0 pointer-events-none',
      ].join(' ')}>
        <button
          type="button"
          onClick={() => {
            // Close other sheets first
            setThreadRoot(null)
            setFilterOpen(false)
            setDmOpen(true)
          }}
          aria-label="Open chat"
          className="h-9 w-9 shrink-0 rounded-lg text-brezn-muted grid place-items-center hover:text-brezn-text focus:outline-none"
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

        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search posts…"
          className="flex-1 rounded-lg border border-brezn-border bg-brezn-panel2 px-2.5 py-1.5 text-xs outline-none placeholder:text-brezn-muted focus:ring-2 focus:ring-brezn-gold/40"
        />

        <button
          type="button"
          onClick={() => {
            // Close other sheets first
            setThreadRoot(null)
            setDmOpen(false)
            setDmTargetPubkey(null)
            setFilterOpen(true)
          }}
          aria-label="Open menu"
          className="h-9 w-9 shrink-0 rounded-lg text-brezn-muted grid place-items-center hover:text-brezn-text focus:outline-none"
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
      </div>

      <Feed
        feedState={feedState}
        geoCell={geoCell}
        viewerPoint={viewerPoint}
        isOffline={isOffline}
        reactionsByNoteId={mergedReactionsByNoteId}
        canReact={!isOffline}
        events={filteredEvents}
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
        onOpenChat={pubkey => {
          // Don't open chat if user is blocked or if it's own pubkey
          if (!blockedPubkeys.includes(pubkey) && pubkey !== identity.pubkey) {
            setDmTargetPubkey(pubkey)
            setDmOpen(true)
          }
        }}
      />

      {/* Always-visible compose button (esp. on mobile) */}
      <button
        type="button"
        onClick={() => {
          // Close other sheets first
          setThreadRoot(null)
          setDmOpen(false)
          setDmTargetPubkey(null)
          setFilterOpen(false)
          setIsComposerOpen(true)
        }}
        aria-label="Create new post"
        className={[
          'fixed z-50',
          // Fallback for browsers that don't support env(safe-area-inset-*)
          'bottom-6 left-1/2 -translate-x-1/2',
          // Prefer safe-area positioning when supported
          'bottom-[calc(env(safe-area-inset-bottom)+1.5rem)]',
          'h-13 w-13 rounded-full',
          'bg-brezn-gold text-brezn-bg shadow-soft',
          'grid place-items-center',
          'hover:opacity-95 active:scale-[0.98]',
          'pointer-events-auto',
          // subtle ring around the button
          "before:content-[''] before:absolute before:inset-0 before:rounded-full before:border before:border-brezn-gold/40 before:pointer-events-none",
        ].join(' ')}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
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
          onBlockUser={async pubkey => {
            const next = [...blockedPubkeys, pubkey]
            await client.setBlockedPubkeys(next)
            setBlockedPubkeys(client.getBlockedPubkeys())
          }}
          reactionsByNoteId={mergedReactionsByNoteId}
          canReact={!isOffline}
          onReact={evt => void reactToPost(evt)}
          onOpenChat={pubkey => {
            // Don't open chat if user is blocked or if it's own pubkey
            if (!blockedPubkeys.includes(pubkey) && pubkey !== identity.pubkey) {
              // Close thread sheet first to avoid multiple sheets overlapping
              setThreadRoot(null)
              // Small delay to ensure thread sheet closes before opening chat
              setTimeout(() => {
                setDmTargetPubkey(pubkey)
                setDmOpen(true)
              }, 100)
            }
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
          onRelaysChanged={() => {
            // Reset feed when relays change
            if (geoCell) {
              requestLocationAndLoad()
            }
          }}
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


