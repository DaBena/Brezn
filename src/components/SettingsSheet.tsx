import { useCallback, useEffect, useRef, useState } from 'react'
import type { BreznNostrClient } from '../lib/nostrClient'
import { Sheet } from './Sheet'
import { GeohashSettings } from './settings/GeohashSettings'
import { ModerationSettings } from './settings/ModerationSettings'
import { KeyManagement } from './settings/KeyManagement'
import { RelaySettings } from './settings/RelaySettings'
import { MediaUploadSettings } from './settings/MediaUploadSettings'
import { ProfileSettings } from './settings/ProfileSettings'

export function SettingsSheet(props: {
  open: boolean
  onClose: () => void
  client: BreznNostrClient
  onModerationChanged?: () => void
  geohashLength: number
  geoCell: string | null
  onGeohashLengthChange: (length: number) => void
  onRelaysChanged?: () => void
}) {
  const { open, onClose, client, onModerationChanged, geohashLength, geoCell, onGeohashLengthChange, onRelaysChanged } = props

  // Media endpoint state (needed for ProfileSettings)
  const [mediaEndpoint, setMediaEndpoint] = useState<string>(() => client.getMediaUploadEndpoint() ?? '')

  // Profile state (needed for persistence on close)
  const [currentProfile, setCurrentProfile] = useState<{ name: string; picture: string } | null>(null)
  const initialProfileRef = useRef<{ name: string; picture: string } | null>(null)
  const initialMediaEndpointRef = useRef<string>('')
  const initialRelaysRef = useRef<string[]>([])

  const [closing, setClosing] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)

  // Reset key to force sub-components to reset when sheet opens
  const [resetKey, setResetKey] = useState(0)

  // Memoize onProfileChange to prevent infinite loops
  const handleProfileChange = useCallback((profile: { name: string; picture: string }) => {
    if (!initialProfileRef.current) {
      // First load - set initial reference
      initialProfileRef.current = profile
    }
    setCurrentProfile(profile)
  }, [])

  // Open/close lifecycle
  useEffect(() => {
    if (!open) return
    // Avoid setState directly in effect body (eslint rule).
    const schedule = (fn: () => void) => {
      if (typeof queueMicrotask === 'function') queueMicrotask(fn)
      else window.setTimeout(fn, 0)
    }
      schedule(() => {
        setClosing(false)
      {
        const ep = client.getMediaUploadEndpoint() ?? ''
        initialMediaEndpointRef.current = ep
        setMediaEndpoint(ep)
      }
      // Store initial relays when settings open
      initialRelaysRef.current = [...client.getRelays()]
      setCurrentProfile(null) // Will be set by ProfileSettings when loaded
      setResetKey(prev => prev + 1) // Force reset of sub-components
    })
  }, [client, open])

  async function persistAndClose() {
    if (closing) return
    if (profileSaving) return

    setClosing(true)

    // Persist media endpoint
    try {
      const trimmed = mediaEndpoint.trim()
      const normalized = trimmed ? trimmed : null // empty => disable
      const current = (client.getMediaUploadEndpoint() ?? '').trim()
      const next = (normalized ?? '').trim()
      if (current !== next) {
        client.setMediaUploadEndpoint(normalized)
        initialMediaEndpointRef.current = client.getMediaUploadEndpoint() ?? ''
      }
    } catch (e) {
      setClosing(false)
      // Media endpoint error - could show toast here if needed
      return
    }

    // Persist profile metadata
    if (currentProfile) {
    try {
      const initial = initialProfileRef.current ?? { name: '', picture: '' }
        const nextName = currentProfile.name.trim()
        const nextPicture = currentProfile.picture.trim()
      const changed = initial.name.trim() !== nextName || initial.picture.trim() !== nextPicture
      if (changed) {
        setProfileSaving(true)
          await client.updateProfile({ name: currentProfile.name, picture: currentProfile.picture })
        initialProfileRef.current = { name: nextName, picture: nextPicture }
      }
    } catch (e) {
      setClosing(false)
      setProfileSaving(false)
        // Profile error will be shown in ProfileSettings component
      return
    } finally {
      setProfileSaving(false)
      }
    }

    // Check if relays changed
    const currentRelays = client.getRelays()
    const initialRelays = initialRelaysRef.current
    const relaysChanged = JSON.stringify([...currentRelays].sort()) !== JSON.stringify([...initialRelays].sort())
    if (relaysChanged && onRelaysChanged) {
      onRelaysChanged()
    }

    setClosing(false)
    onClose()
  }

  return (
    <Sheet open={open} title="Settings" onClose={() => void persistAndClose()} dismissible={!closing && !profileSaving}>
      <div className="mt-4 space-y-3">
        <GeohashSettings geohashLength={geohashLength} geoCell={geoCell} onGeohashLengthChange={onGeohashLengthChange} />

        <ModerationSettings key={`moderation-${resetKey}`} client={client} onModerationChanged={onModerationChanged} />

        <KeyManagement client={client} />

        <RelaySettings key={`relays-${resetKey}`} client={client} />

        <MediaUploadSettings
          key={`media-${resetKey}`}
          mediaEndpoint={mediaEndpoint}
          onMediaEndpointChange={setMediaEndpoint}
        />

        <ProfileSettings
          key={`profile-${resetKey}`}
          client={client}
          mediaEndpoint={mediaEndpoint}
          onProfileChange={handleProfileChange}
        />

        <div className="p-3 pt-6 border-t border-brezn-border">
          <div className="text-xs text-brezn-muted">
            Source {' '}
            <a
              href="https://github.com/dabena/Brezn"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline hover:text-blue-400 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </Sheet>
  )
}
