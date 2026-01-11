import { memo } from 'react'
import * as nip19 from 'nostr-tools/nip19'
import type { Profile } from '../hooks/useProfiles'
import { shortNpub } from '../lib/nostrUtils'

export const PostIdentity = memo(function PostIdentity(props: { pubkey: string; profile?: Profile; onClick?: () => void }) {
  const { pubkey, profile, onClick } = props

  const displayName = profile?.name?.trim() || null
  const picture = profile?.picture?.trim() || null

  return (
    <div 
      className={[
        'flex items-center gap-2',
        onClick ? 'cursor-pointer hover:opacity-80' : '',
      ].join(' ')}
      onClick={onClick ? (e) => {
        e.stopPropagation()
        onClick()
      } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          onClick()
        }
      } : undefined}
    >
      {picture ? (
        <img
          src={picture}
          alt=""
          className="h-6 w-6 shrink-0 rounded-full border border-brezn-border bg-brezn-panel2 object-cover"
          onError={e => {
            // Replace image with placeholder icon on error
            const target = e.currentTarget
            const parent = target.parentElement
            if (parent) {
              target.style.display = 'none'
              const placeholder = document.createElement('div')
              placeholder.className = 'h-6 w-6 shrink-0 rounded-full border border-brezn-border bg-brezn-panel2 flex items-center justify-center'
              placeholder.setAttribute('aria-hidden', 'true')
              placeholder.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-brezn-muted"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>'
              parent.appendChild(placeholder)
            }
          }}
        />
      ) : (
        <div className="h-6 w-6 shrink-0 rounded-full border border-brezn-border bg-brezn-panel2 flex items-center justify-center" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brezn-muted">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
      )}
      <div className="min-w-0">
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

