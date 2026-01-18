import { useState } from 'react'
import type { Event } from 'nostr-tools'

export type SheetType = 'composer' | 'thread' | 'settings' | 'dm'

export interface SheetState {
  composer: { open: boolean }
  thread: { open: boolean; root: Event | null }
  settings: { open: boolean }
  dm: { open: boolean; targetPubkey: string | null }
}

export function useAppState() {
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [threadRoot, setThreadRoot] = useState<Event | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [dmOpen, setDmOpen] = useState(false)
  const [dmTargetPubkey, setDmTargetPubkey] = useState<string | null>(null)

  const openSheet = (type: SheetType, options?: { threadRoot?: Event; dmTargetPubkey?: string }) => {
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
    }
  }

  const closeAllSheets = () => {
    setIsComposerOpen(false)
    setThreadRoot(null)
    setFilterOpen(false)
    setDmOpen(false)
    setDmTargetPubkey(null)
  }

  return {
    sheets: {
      composer: { open: isComposerOpen },
      thread: { open: threadRoot !== null, root: threadRoot },
      settings: { open: filterOpen },
      dm: { open: dmOpen, targetPubkey: dmTargetPubkey },
    },
    openSheet,
    closeSheet,
    closeAllSheets,
  }
}
