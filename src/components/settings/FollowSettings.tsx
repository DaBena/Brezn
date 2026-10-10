import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { nip19 } from '../../lib/nostrPrimitives'
import { shortNpub } from '../../lib/nostrUtils'
import type { BreznNostrClient } from '../../lib/nostrClient'
import { FollowButton } from '../FollowButton'

type FollowSettingsProps = {
  client: BreznNostrClient
  onFollowsChanged?: () => void
}

export function FollowSettings({ client, onFollowsChanged }: FollowSettingsProps) {
  const { t } = useTranslation()
  const [followed, setFollowed] = useState<string[]>(() => client.getFollowedPubkeys())

  useEffect(() => {
    const id = window.setTimeout(() => setFollowed(client.getFollowedPubkeys()), 0)
    return () => window.clearTimeout(id)
  }, [client])

  function unfollow(pubkey: string) {
    const pk = pubkey.toLowerCase()
    client.setFollowedPubkeys(client.getFollowedPubkeys().filter((p) => p.toLowerCase() !== pk))
    setFollowed(client.getFollowedPubkeys())
    onFollowsChanged?.()
  }

  return (
    <div className="p-3">
      <div className="text-xs font-semibold text-brezn-muted">{t('follow.followingList')}</div>
      {followed.length === 0 ? (
        <div className="mt-2 text-xs text-brezn-muted">{t('follow.empty')}</div>
      ) : (
        <ul className="mt-2 space-y-2">
          {followed.map((pk) => {
            let npub = pk
            try {
              npub = nip19.npubEncode(pk)
            } catch {
              /* keep hex */
            }
            return (
              <li key={pk} className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate font-mono text-xs text-brezn-text">
                  {shortNpub(npub, 12, 8)}
                </div>
                <FollowButton isFollowed onClick={() => unfollow(pk)} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
