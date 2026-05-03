import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BreznNostrClient } from '../lib/nostrClient'
import { Sheet } from './Sheet'
import { GeohashSettings } from './settings/GeohashSettings'
import { ModerationSettings } from './settings/ModerationSettings'
import { KeyManagement } from './settings/KeyManagement'
import { RelaySettings } from './settings/RelaySettings'
import { MediaUploadSettings } from './settings/MediaUploadSettings'
import { ProfileSettings } from './settings/ProfileSettings'
import { ThemeSettings } from './settings/ThemeSettings'
import { useTheme } from '../hooks/useTheme'
import { useToast } from './ToastContext'

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
  const {
    open,
    onClose,
    client,
    onModerationChanged,
    geohashLength,
    geoCell,
    onGeohashLengthChange,
    onRelaysChanged,
  } = props

  const { t } = useTranslation()
  const { showToast } = useToast()
  const { theme, setTheme } = useTheme(client)
  const [mediaEndpoint, setMediaEndpoint] = useState<string>(
    () => client.getMediaUploadEndpoint() ?? '',
  )
  const [currentProfile, setCurrentProfile] = useState<{
    name: string
    picture: string
    about: string
  } | null>(null)
  const initialProfileRef = useRef<{ name: string; picture: string; about: string } | null>(null)
  const initialMediaEndpointRef = useRef<string>('')
  const initialRelaysRef = useRef<string[]>([])

  const [resetKey, setResetKey] = useState(0)

  const handleProfileChange = useCallback(
    (profile: { name: string; picture: string; about: string }) => {
      if (!initialProfileRef.current) {
        initialProfileRef.current = profile
      }
      setCurrentProfile(profile)
    },
    [],
  )

  useEffect(() => {
    if (!open) return
    const schedule = (fn: () => void) => {
      if (typeof queueMicrotask === 'function') queueMicrotask(fn)
      else window.setTimeout(fn, 0)
    }
    schedule(() => {
      initialProfileRef.current = null
      {
        const ep = client.getMediaUploadEndpoint() ?? ''
        initialMediaEndpointRef.current = ep
        setMediaEndpoint(ep)
      }
      initialRelaysRef.current = [...client.getRelays()]
      setCurrentProfile(null)
      setResetKey((prev) => prev + 1)
    })
  }, [client, open])

  function persistAndClose() {
    try {
      const trimmed = mediaEndpoint.trim()
      const normalized = trimmed ? trimmed : null // empty => disable
      const current = (client.getMediaUploadEndpoint() ?? '').trim()
      const next = (normalized ?? '').trim()
      if (current !== next) {
        client.setMediaUploadEndpoint(normalized)
        initialMediaEndpointRef.current = client.getMediaUploadEndpoint() ?? ''
      }
    } catch {
      return
    }

    if (currentProfile) {
      const initial = initialProfileRef.current ?? { name: '', picture: '', about: '' }
      const nextName = currentProfile.name.trim()
      const nextPicture = currentProfile.picture.trim()
      const nextAbout = currentProfile.about.trim()
      const changed =
        initial.name.trim() !== nextName ||
        initial.picture.trim() !== nextPicture ||
        (initial.about ?? '').trim() !== nextAbout
      if (changed) {
        void client
          .updateProfile({
            name: currentProfile.name,
            picture: currentProfile.picture,
            about: currentProfile.about,
          })
          .then(() => {
            initialProfileRef.current = { name: nextName, picture: nextPicture, about: nextAbout }
          })
          .catch((e) => {
            showToast(e instanceof Error ? e.message : t('app.publishFailed'), 'error')
          })
      }
    }

    const currentRelays = client.getRelays()
    const initialRelays = initialRelaysRef.current
    const relaysChanged =
      JSON.stringify([...currentRelays].sort()) !== JSON.stringify([...initialRelays].sort())
    if (relaysChanged && onRelaysChanged) {
      onRelaysChanged()
    }

    onClose()
  }

  return (
    <Sheet open={open} title={t('settings.title')} onClose={persistAndClose}>
      <div className="mt-4 space-y-3">
        <ThemeSettings theme={theme} onThemeChange={setTheme} />

        <GeohashSettings
          geohashLength={geohashLength}
          geoCell={geoCell}
          onGeohashLengthChange={onGeohashLengthChange}
        />

        <ModerationSettings
          key={`moderation-${resetKey}`}
          client={client}
          onModerationChanged={onModerationChanged}
        />

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
            {t('settings.source')}{' '}
            <a
              href="https://github.com/dabena/Brezn"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brezn-link underline transition-colors hover:opacity-90"
            >
              {t('settings.github')}
            </a>
          </div>
        </div>
      </div>
    </Sheet>
  )
}
