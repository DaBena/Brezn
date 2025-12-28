import { useEffect, useId, useRef, useState } from 'react'
import type { BreznNostrClient } from '../../lib/nostrClient'
import { uploadMediaFile } from '../../lib/mediaUpload'

type ProfileSettingsProps = {
  client: BreznNostrClient
  mediaEndpoint: string
  onProfileChange?: (profile: { name: string; picture: string }) => void
}

export function ProfileSettings({ client, mediaEndpoint, onProfileChange }: ProfileSettingsProps) {
  const [profileName, setProfileName] = useState<string>('')
  const [profilePicture, setProfilePicture] = useState<string>('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [profileUploadState, setProfileUploadState] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [profileUploadError, setProfileUploadError] = useState<string | null>(null)
  const profileFileInputId = useId()
  const initialProfileRef = useRef<{ name: string; picture: string } | null>(null)

  // Track last notified values to avoid duplicate notifications
  const lastNotifiedRef = useRef<{ name: string; picture: string } | null>(null)

  // Load profile on mount
  useEffect(() => {
    setProfileLoading(true)
    client
      .getMyProfile()
      .then(profile => {
        const name = profile?.name ?? ''
        const picture = profile?.picture ?? ''
        initialProfileRef.current = { name, picture }
        setProfileName(name)
        setProfilePicture(picture)
        setProfileLoading(false)
        // Only notify if values changed
        const current = { name, picture }
        if (!lastNotifiedRef.current || 
            lastNotifiedRef.current.name !== current.name || 
            lastNotifiedRef.current.picture !== current.picture) {
          lastNotifiedRef.current = current
          onProfileChange?.(current)
        }
      })
      .catch(() => {
        initialProfileRef.current = { name: '', picture: '' }
        setProfileName('')
        setProfilePicture('')
        setProfileLoading(false)
        // Don't notify parent on error - let it keep its current state
        // The parent will see empty values when user explicitly saves
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]) // onProfileChange is stable (memoized), no need to include it

  // Note: We don't notify on every profileName/profilePicture change to avoid infinite loops.
  // The parent is only notified when:
  // 1. Profile is loaded initially (in the useEffect above)
  // 2. User explicitly saves the profile (in SettingsSheet.persistAndClose)

  return (
    <div className="rounded-2xl border border-brezn-border bg-brezn-panel2 p-3">
      <div className="text-xs font-semibold text-brezn-muted">Profil</div>

      {profileLoading ? (
        <div className="mt-3 text-xs text-brezn-muted">Loading profile…</div>
      ) : (
        <>
          <div className="mt-3">
            <label htmlFor="profile-name" className="block text-xs text-brezn-muted mb-1">
              Name
            </label>
            <input
              id="profile-name"
              type="text"
              value={profileName}
              onChange={e => setProfileName(e.target.value)}
              placeholder="Your name (optional)"
              maxLength={100}
              className="w-full rounded-xl border border-brezn-border bg-brezn-panel p-2 text-sm outline-none focus:ring-2 focus:ring-brezn-gold/40"
            />
          </div>

          <div className="mt-3">
            <label htmlFor="profile-picture" className="block text-xs text-brezn-muted mb-1">
              Profile picture
            </label>
            <div className="flex items-center gap-3">
              {profilePicture ? (
                <img
                  src={profilePicture}
                  alt="Profile picture"
                  className="h-16 w-16 shrink-0 rounded-full border border-brezn-border bg-brezn-panel object-cover"
                  onError={e => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              ) : (
                <div className="h-16 w-16 shrink-0 rounded-full border border-brezn-border bg-brezn-panel" />
              )}
              <div className="flex-1">
                <input
                  id={profileFileInputId}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async e => {
                    const file = e.currentTarget.files?.[0] ?? null
                    e.currentTarget.value = ''
                    if (!file) return

                    const mime = (file.type ?? '').toLowerCase()
                    const name = (file.name ?? '').toLowerCase()
                    const isImage =
                      mime.startsWith('image/') ||
                      name.endsWith('.png') ||
                      name.endsWith('.jpg') ||
                      name.endsWith('.jpeg') ||
                      name.endsWith('.gif') ||
                      name.endsWith('.webp') ||
                      name.endsWith('.avif') ||
                      name.endsWith('.svg')

                    if (!isImage) {
                      setProfileUploadState('error')
                      setProfileUploadError('Only images are supported.')
                      return
                    }

                    const maxBytes = 5 * 1024 * 1024 // 5 MB
                    if (file.size > maxBytes) {
                      setProfileUploadState('error')
                      setProfileUploadError('Image is too large (max. 5 MB).')
                      return
                    }

                    if (!mediaEndpoint) {
                      setProfileUploadState('error')
                      setProfileUploadError('Configure media upload endpoint first.')
                      return
                    }

                    setProfileUploadState('uploading')
                    setProfileUploadError(null)
                    try {
                      const { url } = await uploadMediaFile({ endpoint: mediaEndpoint, file })
                      setProfilePicture(url)
                      setProfileUploadState('idle')
                    } catch (err) {
                      setProfileUploadState('error')
                      setProfileUploadError(err instanceof Error ? err.message : 'Upload failed.')
                    }
                  }}
                />
                <div className="flex gap-2">
                  <label
                    htmlFor={profileFileInputId}
                    className={[
                      'flex-1 rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-xs font-semibold text-center',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40',
                      profileUploadState === 'uploading' ? 'opacity-60 cursor-not-allowed' : 'hover:bg-brezn-panel cursor-pointer',
                    ].join(' ')}
                    tabIndex={profileUploadState === 'uploading' ? -1 : 0}
                    role="button"
                    onKeyDown={e => {
                      if (profileUploadState === 'uploading') return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        const input = document.getElementById(profileFileInputId) as HTMLInputElement | null
                        input?.click()
                      }
                    }}
                  >
                    {profileUploadState === 'uploading' ? 'Uploading…' : profilePicture ? 'Change image' : 'Upload image'}
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm('Really reset profile? Name and picture will be removed.')) return
                      setProfileSaving(true)
                      setProfileMsg(null)
                      try {
                        await client.updateProfile({ name: '', picture: '' })
                        setProfileName('')
                        setProfilePicture('')
                        initialProfileRef.current = { name: '', picture: '' }
                        setProfileMsg('Profile reset.')
                        onProfileChange?.({ name: '', picture: '' })
                      } catch (e) {
                        setProfileMsg(e instanceof Error ? e.message : 'Error resetting profile')
                      } finally {
                        setProfileSaving(false)
                      }
                    }}
                    disabled={profileSaving || profileUploadState === 'uploading'}
                    className="flex-1 rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-xs font-semibold hover:bg-brezn-panel disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
                  >
                    Reset
                  </button>
                </div>
                {profilePicture ? (
                  <button
                    type="button"
                    onClick={() => setProfilePicture('')}
                    className="mt-1 w-full rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-xs hover:bg-brezn-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
                  >
                    Remove image
                  </button>
                ) : null}
              </div>
            </div>
            {profileUploadState === 'error' && profileUploadError ? (
              <div className="mt-2 text-xs text-brezn-danger">{profileUploadError}</div>
            ) : null}
            {profilePicture ? (
              <div className="mt-2">
                <input
                  type="text"
                  value={profilePicture}
                  onChange={e => setProfilePicture(e.target.value)}
                  placeholder="Oder URL direkt eingeben"
                  className="w-full rounded-xl border border-brezn-border bg-brezn-panel p-2 text-xs font-mono outline-none focus:ring-2 focus:ring-brezn-gold/40"
                />
              </div>
            ) : null}
          </div>

          {profileMsg ? <div className="mt-2 text-xs text-brezn-muted">{profileMsg}</div> : null}
        </>
      )}
    </div>
  )
}

