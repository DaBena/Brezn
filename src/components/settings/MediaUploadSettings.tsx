import { DEFAULT_NIP96_SERVER } from '../../lib/mediaUpload'

type MediaUploadSettingsProps = {
  mediaEndpoint: string
  onMediaEndpointChange: (endpoint: string) => void
}

export function MediaUploadSettings({ mediaEndpoint, onMediaEndpointChange }: MediaUploadSettingsProps) {

  return (
    <div className="rounded-2xl border border-brezn-border bg-brezn-panel2 p-3">
      <div className="text-xs font-semibold text-brezn-muted">Media Upload</div>
      <div className="mt-1 text-xs text-brezn-muted">
        Direct URL or NIP-96. Default: <span className="font-mono">{DEFAULT_NIP96_SERVER}</span>. Empty = off.
      </div>

      <div className="mt-2 flex gap-2">
        <input
          value={mediaEndpoint}
          onChange={e => onMediaEndpointChange(e.target.value)}
          placeholder={DEFAULT_NIP96_SERVER}
          className="w-full rounded-xl border border-brezn-border bg-brezn-panel p-2 text-sm outline-none focus:ring-2 focus:ring-brezn-gold/40"
        />
        <button
          type="button"
          onClick={() => onMediaEndpointChange(DEFAULT_NIP96_SERVER)}
          className="shrink-0 rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-xs hover:bg-brezn-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
        >
          Default
        </button>
      </div>
    </div>
  )
}

