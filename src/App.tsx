import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Event } from './lib/nostrPrimitives'
import { ComposerSheet } from './components/ComposerSheet'
import { ConversationsSheet } from './components/ConversationsSheet'
import { DMSheet } from './components/DMSheet'
import { Feed } from './components/Feed'
import { PwaUpdateToast } from './components/PwaUpdateToast'
import { AdblockerWarning } from './components/AdblockerWarning'
import { SettingsSheet } from './components/SettingsSheet'
import { ThreadSheet } from './components/ThreadSheet'
import { ProfileSheet } from './components/ProfileSheet'
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
import { useTheme } from './hooks/useTheme'
import { useNavigation } from './hooks/useNavigation'
import { publishPost, publishReply, deletePost, deletePosts } from './lib/postService'
import { reactToPost } from './lib/reactionService'
import { loadDeletedNoteIds, addDeletedNoteId } from './lib/deletedNotes'

export default function App() {
  const { t } = useTranslation()
  const client = useNostrClient()
  const { identity } = useIdentity(client)
  const { showToast } = useToast()

  const appState = useAppState()
  const moderation = useModeration(client)
  useTheme(client)

  const navigation = useNavigation()

  const [deletedNoteIds, setDeletedNoteIds] = useState<Set<string>>(
    () => new Set(loadDeletedNoteIds()),
  )
  const [threadReplyNoteIds, setThreadReplyNoteIds] = useState<string[]>([])
  const [profileNoteIds, setProfileNoteIds] = useState<string[]>([])

  useEffect(() => {
    queueMicrotask(() => {
      setThreadReplyNoteIds([])
    })
  }, [appState.sheets.thread.root?.id])

  useEffect(() => {
    queueMicrotask(() => {
      setProfileNoteIds([])
    })
  }, [appState.sheets.profile.pubkey])

  const {
    feedState,
    requestLocationAndLoad,
    setLocationFromGeohash,
    geoCell,
    viewerGeo5, // saved 5-char cell; used when composing geotags + distance
    sortedEvents,
    viewerPoint,
    geohashLength,
    initialTimedOut,
    lastCloseReasons,
    isLoadingMore,
    loadMore,
    loadMorePage,
    isOffline,
    applyGeohashLength,
  } = useLocalFeed({
    client,
    mutedTerms: moderation.mutedTerms,
    blockedPubkeys: moderation.blockedPubkeys,
    deletedNoteIds,
    identityPubkey: identity.pubkey,
  })

  const profileSheetPubkey = appState.sheets.profile.pubkey
  const threadRootPubkey = appState.sheets.thread.root?.pubkey ?? null
  // Profile sheet + thread root: same profile sub as feed.
  const pubkeysForProfiles = useMemo(() => {
    const fromFeed = sortedEvents.map((e) => e.pubkey)
    const extra: string[] = []
    if (profileSheetPubkey) extra.push(profileSheetPubkey)
    if (threadRootPubkey) extra.push(threadRootPubkey)
    return [...fromFeed, ...extra]
  }, [sortedEvents, profileSheetPubkey, threadRootPubkey])

  const { profilesByPubkey } = useProfiles({ client, pubkeys: pubkeysForProfiles, isOffline })

  const searchFeedPrefetch = useMemo(
    () => ({
      isOffline,
      canPrefetchFeed: feedState.kind === 'live' && Boolean(geoCell),
      loadMorePage,
    }),
    [isOffline, feedState.kind, geoCell, loadMorePage],
  )

  const search = useSearch(sortedEvents, profilesByPubkey, searchFeedPrefetch)

  // Thread/profile ids first (reaction slice cap).
  const noteIdsForReactions = useMemo(() => {
    const fromFeed = sortedEvents.map((e) => e.id)
    const root = appState.sheets.thread.root
    const threadIds = root ? [root.id, ...threadReplyNoteIds] : []
    const profileIds = appState.sheets.profile.pubkey ? profileNoteIds : []
    const merged = [...profileIds, ...threadIds]
    const rest = fromFeed.filter((id) => !merged.includes(id))
    return [...merged, ...rest]
  }, [
    sortedEvents,
    appState.sheets.thread.root,
    threadReplyNoteIds,
    appState.sheets.profile.pubkey,
    profileNoteIds,
  ])

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

  const handleOpenProfile = (pubkey: string) => {
    if (moderation.blockedPubkeys.includes(pubkey)) return
    appState.openSheet('profile', { profilePubkey: pubkey })
  }

  // Handlers using services
  const handlePublishPost = async (content: string) => {
    try {
      await publishPost(client, content, viewerGeo5)
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('app.publishFailed')
      showToast(msg, 'error')
    }
  }

  const handlePublishReply = async (root: Event, content: string) => {
    if (isOffline) {
      showToast(t('app.offlineComments'), 'error')
      return
    }
    try {
      await publishReply(client, root, content, viewerGeo5)
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('app.publishFailed')
      showToast(msg, 'error')
    }
  }

  const handleDeletePost = async (evt: Event, childOwnEvents?: Event[]) => {
    if (isOffline) throw new Error(t('app.offlineDelete'))
    const toDelete = [evt, ...(childOwnEvents ?? [])]
    if (toDelete.length === 1) {
      await deletePost(client, evt, identity.pubkey)
    } else {
      await deletePosts(client, toDelete, identity.pubkey)
    }
    setDeletedNoteIds((prev) => {
      const next = new Set(prev)
      for (const eventToDelete of toDelete) {
        addDeletedNoteId(eventToDelete.id)
        next.add(eventToDelete.id)
      }
      return next
    })
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
    await reactToPost(client, evt, identity.pubkey, undefined, (error) => {
      optimisticReactions.removeOptimisticReaction(evt.id)
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
        client={client}
        feedState={feedState}
        geoCell={geoCell}
        viewerPoint={viewerPoint}
        isOffline={isOffline}
        showCookieNotice={feedState.kind === 'need-location' && viewerGeo5 === null}
        profilesByPubkey={profilesByPubkey}
        reactionsByNoteId={optimisticReactions.mergedReactionsByNoteId}
        canReact={!isOffline}
        events={search.filteredEvents}
        searchQuery={search.searchQuery}
        initialTimedOut={initialTimedOut}
        lastCloseReasons={lastCloseReasons}
        isLoadingMore={isLoadingMore}
        onRequestLocation={() => void requestLocationAndLoad({ forceBrowser: true })}
        onLoadMore={loadMore}
        onReact={(evt) => void handleReactToPost(evt)}
        onOpenProfile={handleOpenProfile}
        onOpenThread={(evt) => {
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
        onRequestLocation={(onFinished) =>
          void requestLocationAndLoad({ forceBrowser: true, onFinished })
        }
        onSelectCell={setLocationFromGeohash}
        onPublish={handlePublishPost}
        mediaUploadEndpoint={client.getMediaUploadEndpoint()}
        feedEvents={search.filteredEvents}
        feedMapLegend={t('composer.feedMapLegend')}
        onOpenFeedEvent={(evt) => {
          if (moderation.blockedPubkeys.includes(evt.pubkey)) return
          appState.closeSheet('composer')
          appState.openSheet('thread', { threadRoot: evt })
        }}
      />

      {appState.sheets.profile.pubkey ? (
        <ProfileSheet
          open
          pubkey={appState.sheets.profile.pubkey}
          cachedProfile={profilesByPubkey.get(appState.sheets.profile.pubkey)}
          client={client}
          viewerPoint={viewerPoint}
          mutedTerms={moderation.mutedTerms}
          blockedPubkeys={moderation.blockedPubkeys}
          isOffline={isOffline}
          reactionsByNoteId={optimisticReactions.mergedReactionsByNoteId}
          canReact={!isOffline}
          onReact={(evt) => void handleReactToPost(evt)}
          onNoteIdsChange={setProfileNoteIds}
          onOpenProfile={handleOpenProfile}
          onOpenThread={(evt) => {
            if (moderation.blockedPubkeys.includes(evt.pubkey)) return
            appState.openSheet('thread', { threadRoot: evt, retainProfileWhenOpeningThread: true })
          }}
          onClose={() => appState.closeSheet('profile')}
          onOpenDM={(() => {
            const pk = appState.sheets.profile.pubkey
            if (!pk || !canOpenChat(pk)) return undefined
            return () => handleOpenChat(pk, () => appState.closeSheet('profile'))
          })()}
        />
      ) : null}

      {appState.sheets.thread.root ? (
        <ThreadSheet
          open
          root={appState.sheets.thread.root}
          feedProfilesByPubkey={profilesByPubkey}
          client={client}
          mutedTerms={moderation.mutedTerms}
          blockedPubkeys={moderation.blockedPubkeys}
          isOffline={isOffline}
          viewerPoint={viewerPoint}
          onClose={() => appState.closeSheet('thread')}
          onPublishReply={(content) =>
            void handlePublishReply(appState.sheets.thread.root!, content)
          }
          onDelete={(evt) => void handleDeletePost(evt)}
          onBlockUser={async (pubkey) => {
            const next = [...moderation.blockedPubkeys, pubkey]
            await client.setBlockedPubkeys(next)
            moderation.refreshFromClient()
          }}
          reactionsByNoteId={optimisticReactions.mergedReactionsByNoteId}
          canReact={!isOffline}
          onReact={(evt) => void handleReactToPost(evt)}
          onThreadRepliesChange={setThreadReplyNoteIds}
          onOpenProfile={handleOpenProfile}
          onOpenThread={(evt) => {
            if (moderation.blockedPubkeys.includes(evt.pubkey)) return
            appState.openSheet('thread', { threadRoot: evt })
          }}
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
