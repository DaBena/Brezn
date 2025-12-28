import { geohashPrecisionHint } from '../../lib/geo'

type GeohashSettingsProps = {
  geohashLength: number
  geoCell: string | null
  onGeohashLengthChange: (length: number) => void
}

export function GeohashSettings({ geohashLength, geoCell, onGeohashLengthChange }: GeohashSettingsProps) {
  return (
    <div className="rounded-2xl border border-brezn-border bg-brezn-panel2 p-3">
      <div className="text-xs font-semibold text-brezn-muted">Search radius</div>
      <div className="mt-1 text-xs text-brezn-muted">
        Geohash length: {geohashLength} • {geohashPrecisionHint(geohashLength)}
      </div>
      {geoCell ? (
        <div className="mt-1 text-xs text-brezn-muted">
          GeoHash:{' '}
          <span className="rounded-lg border border-brezn-border bg-brezn-panel px-2 py-0.5 font-mono">{geoCell}</span>
        </div>
      ) : (
        <div className="mt-1 text-xs text-brezn-muted">GeoHash: -</div>
      )}
      <div className="mt-3 flex items-center gap-1">
        <button
          type="button"
          onClick={() => onGeohashLengthChange(Math.max(1, geohashLength - 1))}
          disabled={geohashLength <= 1}
          className="h-10 w-10 shrink-0 rounded-xl border border-brezn-border bg-brezn-panel2 text-lg font-semibold hover:bg-brezn-panel disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
          aria-label="Decrease radius"
        >
          -
        </button>
        <div className="px-2">
          <div className="text-sm font-semibold">Length {geohashLength}</div>
          <div className="text-xs text-brezn-muted">{geohashPrecisionHint(geohashLength)}</div>
        </div>
        <button
          type="button"
          onClick={() => onGeohashLengthChange(Math.min(5, geohashLength + 1))}
          disabled={geohashLength >= 5}
          className="h-10 w-10 shrink-0 rounded-xl border border-brezn-border bg-brezn-panel2 text-lg font-semibold hover:bg-brezn-panel disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
          aria-label="Increase radius"
        >
          +
        </button>
      </div>
    </div>
  )
}

