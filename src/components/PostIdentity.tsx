import { memo } from 'react'
import * as nip19 from 'nostr-tools/nip19'
import type { Profile } from '../hooks/useProfiles'
import { shortNpub } from '../lib/nostrUtils'

const avatarSizes = { default: 'h-6 w-6', large: 'h-12 w-12' } as const

export const PostIdentity = memo(function PostIdentity(props: {
  pubkey: string
  profile?: Profile
  displayNameOverride?: string
  /** Click on name/npub (e.g. open chat) */
  onClick?: () => void
  avatarSize?: keyof typeof avatarSizes
}) {
  const { pubkey, profile, displayNameOverride, onClick, avatarSize = 'default' } = props
  const sizeClass = avatarSizes[avatarSize]
  const iconSize = avatarSize === 'large' ? 28 : 14

  const displayName = displayNameOverride?.trim() || profile?.name?.trim() || null
  const picture = profile?.picture?.trim() || null

  return (
    <div className="flex items-center gap-2">
      {picture ? (
        <a
          href={picture}
          target="_blank"
          rel="noopener noreferrer"
          className={`${sizeClass} shrink-0 block rounded-full border border-brezn-border bg-brezn-panel2 overflow-hidden`}
          onClick={e => e.stopPropagation()}
        >
          <img
            src={picture}
            alt=""
            className={`${sizeClass} w-full object-cover`}
            onError={e => {
              const target = e.currentTarget
              const parent = target.parentElement
              if (parent) {
                target.style.display = 'none'
                const placeholder = document.createElement('div')
                placeholder.className = `${sizeClass} shrink-0 rounded-full border-0 bg-brezn-panel2 flex items-center justify-center`
                placeholder.setAttribute('aria-hidden', 'true')
                placeholder.innerHTML = `<svg viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-brezn-muted"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>`
                parent.appendChild(placeholder)
              }
            }}
          />
        </a>
      ) : (
        <div
          className={`${sizeClass} shrink-0 rounded-full border border-brezn-border bg-brezn-panel2 flex items-center justify-center`}
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" width={iconSize} height={iconSize} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brezn-muted">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
      )}
      <div
        className={`min-w-0 ${onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
        onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onClick() }
        } : undefined}
      >
        {displayName ? (
          <div className="truncate text-sm font-semibold text-brezn-text">{displayName}</div>
        ) : null}
        <div className={`truncate font-mono text-[11px] ${displayName ? 'text-brezn-muted' : 'text-brezn-text'}`}>
          {shortNpub(nip19.npubEncode(pubkey), 8, 4)}
        </div>
      </div>
    </div>
  )
})
