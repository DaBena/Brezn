import { buttonBase } from '../../lib/buttonStyles'
import { geohashPrecisionHint } from '../../lib/geo'

type GeohashSettingsProps = {
  geohashLength: number
  geoCell: string | null
  onGeohashLengthChange: (length: number) => void
}

export function GeohashSettings({ geohashLength, geoCell, onGeohashLengthChange }: GeohashSettingsProps) {
  return (
    <div className="p-3">
      <div className="text-xs font-semibold text-brezn-muted">Search radius</div>
      <div className="mt-1 text-xs text-brezn-muted">
        Geohash length: {geohashLength === 0 ? '0 (current + east/west)' : geohashLength} • {geohashLength === 0 ? '3 queries' : geohashPrecisionHint(geohashLength)}
      </div>
      {geoCell ? (
        <div className="mt-1 text-xs text-brezn-muted">
          GeoHash:{' '}
          <span className="rounded-lg bg-brezn-panel px-2 py-0.5 font-mono">{geoCell}</span>
        </div>
      ) : (
        <div className="mt-1 text-xs text-brezn-muted">GeoHash: -</div>
      )}
      <div className="mt-3 flex items-center gap-1">
        <button
          type="button"
          onClick={() => onGeohashLengthChange(Math.max(0, geohashLength - 1))}
          disabled={geohashLength === 0}
          className={`h-10 w-10 shrink-0 rounded-xl text-lg font-semibold disabled:cursor-not-allowed ${buttonBase}`}
          aria-label="Decrease radius"
        >
          -
        </button>
        <div className="px-2">
          <div className="text-sm font-semibold">
            Length {geohashLength}
          </div>
          <div className="text-xs text-brezn-muted">
            {geohashLength === 0 ? '3 queries (current + east/west)' : geohashPrecisionHint(geohashLength)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onGeohashLengthChange(Math.min(5, geohashLength + 1))}
          disabled={geohashLength === 5}
          className={`h-10 w-10 shrink-0 rounded-xl text-lg font-semibold disabled:cursor-not-allowed ${buttonBase}`}
          aria-label="Increase radius"
        >
          +
        </button>
      </div>
    </div>
  )
}

