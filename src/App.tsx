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
import { NavigationBar } from './components/NavigationBar'
import { ComposeButton } from './components/ComposeButton'
import { useToast } from './components/ToastContext'
import { useIdentity } from './hooks/useIdentity'
import { useLocalFeed } from './hooks/useLocalFeed'
import { useNostrClient } from './hooks/useNostrClient'
import { useProfiles } from './hooks/useProfiles'
import { useReactions } from './hooks/useReactions'
import { useAppState } from './hooks/useAppState'
import { useSearch } from './hooks/useSearch'
import { useModeration } from './hooks/useModeration'
import { useOptimisticReactions } from './hooks/useOptimisticReactions'
import { useNavigation } from './hooks/useNavigation'
import { useTheme } from './hooks/useTheme'
import { publishPost, publishReply, deletePost } from './lib/postService'
import { reactToPost } from './lib/reactionService'
import { loadDeletedNoteIds, addDeletedNoteId } from './lib/deletedNotes'

export default function App() {
  const client = useNostrClient()
  const { identity } = useIdentity(client)
  const { showToast } = useToast()

  // Custom Hooks
  const appState = useAppState()
  const moderation = useModeration(client)
  const navigation = useNavigation()
  useTheme(client) // Initialize theme management

  const [deletedNoteIds, setDeletedNoteIds] = useState<Set<string>>(
    () => new Set(loadDeletedNoteIds())
  )

  const {
    feedState,
    requestLocationAndLoad,
    setLocationFromGeohash,
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
  } = useLocalFeed({
    client,
    mutedTerms: moderation.mutedTerms,
    blockedPubkeys: moderation.blockedPubkeys,
    deletedNoteIds,
    identityPubkey: identity.pubkey,
  })

  // Load profiles for search functionality
  const pubkeysForProfiles = useMemo(() => sortedEvents.map(e => e.pubkey), [sortedEvents])
  const { profilesByPubkey } = useProfiles({ client, pubkeys: pubkeysForProfiles, isOffline })

  // Search functionality
  const search = useSearch(sortedEvents, profilesByPubkey)

  // Reactions
  const noteIdsForReactions = useMemo(() => {
    const ids = [...sortedEvents.map(e => e.id)]
    if (appState.sheets.thread.root && !ids.includes(appState.sheets.thread.root.id)) {
      ids.push(appState.sheets.thread.root.id)
    }
    return ids
  }, [sortedEvents, appState.sheets.thread.root])

  const { reactionsByNoteId } = useReactions({
    client,
    noteIds: noteIdsForReactions,
    viewerPubkey: identity.pubkey,
    isOffline,
  })

  const optimisticReactions = useOptimisticReactions(reactionsByNoteId)

  // Helper: Check if chat can be opened for a pubkey
  const canOpenChat = (pubkey: string): boolean => {
    return !moderation.blockedPubkeys.includes(pubkey) && pubkey !== identity.pubkey
  }

  // Helper: Open chat with optional sheet closing
  const handleOpenChat = (pubkey: string, closeSheetFirst?: () => void) => {
    if (!canOpenChat(pubkey)) return
    if (closeSheetFirst) {
      closeSheetFirst()
      setTimeout(() => {
        appState.openSheet('dm', { dmTargetPubkey: pubkey })
      }, 100)
    } else {
      appState.openSheet('dm', { dmTargetPubkey: pubkey })
    }
  }

  // Handlers using services
  const handlePublishPost = async (content: string) => {
    try {
      await publishPost(client, content, viewerGeo5)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Publish failed.'
      console.log('[Brezn] toast: Publish post failed', { error: msg })
      showToast(msg, 'error')
    }
  }

  const handlePublishReply = async (root: Event, content: string) => {
    if (isOffline) {
      console.log('[Brezn] toast: Offline - Comments read-only')
      showToast('Offline - Comments are read-only.', 'error')
      return
    }
    try {
      await publishReply(client, root, content, viewerGeo5)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Publish failed.'
      console.log('[Brezn] toast: Publish reply failed', { error: msg })
      showToast(msg, 'error')
    }
  }

  const handleDeletePost = async (evt: Event) => {
    if (isOffline) throw new Error('Offline - Deletion event cannot be sent.')
    await deletePost(client, evt, identity.pubkey)
    addDeletedNoteId(evt.id)
    setDeletedNoteIds(prev => new Set(prev).add(evt.id))
  }

  const handleReactToPost = async (evt: Event) => {
    if (isOffline) return
    // Check both merged reactions and persisted reacted note IDs
    if (
      optimisticReactions.mergedReactionsByNoteId[evt.id]?.viewerReacted ||
      optimisticReactions.reactedNoteIdsRef.current.has(evt.id)
    )
      return
    // Optimistically prevent double-like while relay echo is pending.
    optimisticReactions.addOptimisticReaction(evt.id)
    await reactToPost(client, evt, identity.pubkey, undefined, error => {
      optimisticReactions.removeOptimisticReaction(evt.id)
      console.log('[Brezn] toast: Reaction failed', { error: error.message })
      showToast(error.message, 'error')
    })
  }

  return (
    <div className="min-h-dvh bg-brezn-bg text-brezn-text">
      <PwaUpdateToast />
      <AdblockerWarning />
      <NavigationBar
        showNav={navigation.showNav}
        searchQuery={search.searchQuery}
        onSearchChange={search.setSearchQuery}
        onOpenChat={() => appState.openSheet('dm')}
        onOpenMenu={() => appState.openSheet('settings')}
      />

      <Feed
        key={search.searchQuery}
        feedState={feedState}
        geoCell={geoCell}
        viewerPoint={viewerPoint}
        isOffline={isOffline}
        profilesByPubkey={profilesByPubkey}
        reactionsByNoteId={optimisticReactions.mergedReactionsByNoteId}
        canReact={!isOffline}
        events={search.filteredEvents}
        searchQuery={search.searchQuery}
        initialTimedOut={initialTimedOut}
        lastCloseReasons={lastCloseReasons}
        isLoadingMore={isLoadingMore}
        deletedNoteIds={deletedNoteIds}
        onRequestLocation={() => void requestLocationAndLoad({ forceBrowser: true })}
        onLoadMore={loadMore}
        onReact={evt => void handleReactToPost(evt)}
        onOpenThread={evt => {
          // Don't open thread if user is blocked
          if (!moderation.blockedPubkeys.includes(evt.pubkey)) {
            appState.openSheet('thread', { threadRoot: evt })
          }
        }}
      />

      <ComposeButton onClick={() => appState.openSheet('composer')} />

      <ComposerSheet
        open={appState.sheets.composer.open}
        onClose={() => appState.closeSheet('composer')}
        viewerGeo5={viewerGeo5}
        onRequestLocation={onFinished =>
          void requestLocationAndLoad({ forceBrowser: true, onFinished })
        }
        onSelectCell={setLocationFromGeohash}
        onPublish={handlePublishPost}
        mediaUploadEndpoint={client.getMediaUploadEndpoint()}
      />

      {appState.sheets.thread.root ? (
        <ThreadSheet
          open
          root={appState.sheets.thread.root}
          client={client}
          mutedTerms={moderation.mutedTerms}
          blockedPubkeys={moderation.blockedPubkeys}
          isOffline={isOffline}
          viewerPoint={viewerPoint}
          onClose={() => appState.closeSheet('thread')}
          onPublishReply={content => void handlePublishReply(appState.sheets.thread.root!, content)}
          onDelete={evt => void handleDeletePost(evt)}
          onBlockUser={async pubkey => {
            const next = [...moderation.blockedPubkeys, pubkey]
            await client.setBlockedPubkeys(next)
            moderation.refreshFromClient()
          }}
          reactionsByNoteId={optimisticReactions.mergedReactionsByNoteId}
          canReact={!isOffline}
          onReact={evt => void handleReactToPost(evt)}
          onOpenChat={pubkey => handleOpenChat(pubkey, () => appState.closeSheet('thread'))}
        />
      ) : null}

      {appState.sheets.settings.open ? (
        <SettingsSheet
          open
          onClose={() => appState.closeSheet('settings')}
          client={client}
          onModerationChanged={() => {
            moderation.refreshFromClient()
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

      {appState.sheets.dm.open && appState.sheets.dm.targetPubkey ? (
        <DMSheet
          open={appState.sheets.dm.open}
          onClose={() => appState.closeSheet('dm')}
          client={client}
          otherPubkey={appState.sheets.dm.targetPubkey}
        />
      ) : appState.sheets.dm.open ? (
        <ConversationsSheet
          open={appState.sheets.dm.open}
          onClose={() => appState.closeSheet('dm')}
          client={client}
        />
      ) : null}
    </div>
  )
}
