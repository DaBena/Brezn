import type { Profile } from '../hooks/useProfiles'
import { shortHex } from '../lib/nostrUtils'

export function PostIdentity(props: { pubkey: string; profile?: Profile }) {
  const { pubkey, profile } = props

  const displayName = profile?.name?.trim() || null
  const picture = profile?.picture?.trim() || null

  return (
    <div className="flex items-center gap-2">
      {picture ? (
        <img
          src={picture}
          alt=""
          className="h-6 w-6 shrink-0 rounded-full border border-brezn-border bg-brezn-panel2 object-cover"
          onError={e => {
            // Hide image on error, fallback to placeholder
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        <div className="h-6 w-6 shrink-0 rounded-full border border-brezn-border bg-brezn-panel2" aria-hidden="true" />
      )}
      <div className="min-w-0">
        {displayName ? (
          <div className="truncate text-sm font-semibold text-brezn-text">{displayName}</div>
        ) : null}
        <div className={`truncate font-mono text-[11px] ${displayName ? 'text-brezn-muted' : 'text-brezn-text'}`}>
          {shortHex(pubkey, 8, 4)}
        </div>
      </div>
    </div>
  )
}

