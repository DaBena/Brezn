import { useState } from 'react'
import type { Event } from 'nostr-tools'

export type SheetType = 'composer' | 'thread' | 'settings' | 'dm' | 'profile'

export interface SheetState {
  composer: { open: boolean }
  thread: { open: boolean; root: Event | null }
  settings: { open: boolean }
  dm: { open: boolean; targetPubkey: string | null }
  profile: { open: boolean; pubkey: string | null }
}

export function useAppState() {
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [threadRoot, setThreadRoot] = useState<Event | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [dmOpen, setDmOpen] = useState(false)
  const [dmTargetPubkey, setDmTargetPubkey] = useState<string | null>(null)
  const [profilePubkey, setProfilePubkey] = useState<string | null>(null)

  const openSheet = (
    type: SheetType,
    options?: {
      threadRoot?: Event
      /** Keep profile sheet mounted under the thread (e.g. opened post from profile). */
      retainProfileWhenOpeningThread?: boolean
      dmTargetPubkey?: string
      profilePubkey?: string
    },
  ) => {
    if (
      type === 'thread' &&
      options?.threadRoot &&
      options.retainProfileWhenOpeningThread
    ) {
      setIsComposerOpen(false)
      setFilterOpen(false)
      setDmOpen(false)
      setDmTargetPubkey(null)
      setThreadRoot(options.threadRoot)
      return
    }

    // Close all other sheets first
    closeAllSheets()

    switch (type) {
      case 'composer':
        setIsComposerOpen(true)
        break
      case 'thread':
        if (options?.threadRoot) {
          setThreadRoot(options.threadRoot)
        }
        break
      case 'settings':
        setFilterOpen(true)
        break
      case 'dm':
        if (options?.dmTargetPubkey) {
          setDmTargetPubkey(options.dmTargetPubkey)
          setDmOpen(true)
        } else {
          setDmOpen(true)
        }
        break
      case 'profile':
        if (options?.profilePubkey) {
          setProfilePubkey(options.profilePubkey)
        }
        break
    }
  }

  const closeSheet = (type: SheetType) => {
    switch (type) {
      case 'composer':
        setIsComposerOpen(false)
        break
      case 'thread':
        setThreadRoot(null)
        break
      case 'settings':
        setFilterOpen(false)
        break
      case 'dm':
        setDmOpen(false)
        setDmTargetPubkey(null)
        break
      case 'profile':
        setProfilePubkey(null)
        break
    }
  }

  const closeAllSheets = () => {
    setIsComposerOpen(false)
    setThreadRoot(null)
    setFilterOpen(false)
    setDmOpen(false)
    setDmTargetPubkey(null)
    setProfilePubkey(null)
  }

  return {
    sheets: {
      composer: { open: isComposerOpen },
      thread: { open: threadRoot !== null, root: threadRoot },
      settings: { open: filterOpen },
      dm: { open: dmOpen, targetPubkey: dmTargetPubkey },
      profile: { open: profilePubkey !== null, pubkey: profilePubkey },
    },
    openSheet,
    closeSheet,
    closeAllSheets,
  }
}
