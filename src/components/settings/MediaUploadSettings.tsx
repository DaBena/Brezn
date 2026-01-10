import { buttonBase } from '../../lib/buttonStyles'
import { DEFAULT_NIP96_SERVER } from '../../lib/mediaUpload'

type MediaUploadSettingsProps = {
  mediaEndpoint: string
  onMediaEndpointChange: (endpoint: string) => void
}

export function MediaUploadSettings({ mediaEndpoint, onMediaEndpointChange }: MediaUploadSettingsProps) {

  return (
    <div className="p-3">
      <div className="text-xs font-semibold text-brezn-muted">Media Upload</div>
      <div className="mt-1 text-xs text-brezn-muted">
        Direct URL or NIP-96. Default: <span className="font-mono">{DEFAULT_NIP96_SERVER}</span>. Empty = off.
      </div>

      <div className="mt-2 flex gap-2">
        <input
          value={mediaEndpoint}
          onChange={e => onMediaEndpointChange(e.target.value)}
          placeholder={DEFAULT_NIP96_SERVER}
          className="w-full border border-brezn-border bg-brezn-panel p-2 text-sm outline-none"
        />
        <button
          type="button"
          onClick={() => onMediaEndpointChange(DEFAULT_NIP96_SERVER)}
          className={`shrink-0 rounded-xl px-3 py-2 text-xs ${buttonBase}`}
        >
          Default
        </button>
      </div>
    </div>
  )
}

