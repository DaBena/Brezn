import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { buttonBase } from '../../lib/buttonStyles'
import { geohashApproxCellSizeKm } from '../../lib/geo'

function cellSizeHint(len: number, t: TFunction): string {
  if (len < 1 || len > 5) return t('geohash.precisionFallback')
  const c = geohashApproxCellSizeKm(len)
  if (!c) return t('geohash.precisionFallback')
  const w = c.wKm >= 1 ? `~${Math.round(c.wKm)} km` : `~${(c.wKm * 1000).toFixed(0)} m`
  const h = c.hKm >= 1 ? `~${Math.round(c.hKm)} km` : `~${(c.hKm * 1000).toFixed(0)} m`
  return t('geohash.cellSize', { w, h })
}

type GeohashSettingsProps = {
  geohashLength: number
  geoCell: string | null
  onGeohashLengthChange: (length: number) => void
}

export function GeohashSettings({ geohashLength, geoCell, onGeohashLengthChange }: GeohashSettingsProps) {
  const { t } = useTranslation()

  const precisionLine =
    geohashLength === 0 ? t('geohash.queries3') : cellSizeHint(geohashLength, t)

  const lengthSubline =
    geohashLength === 0 ? t('geohash.queriesCurrent') : cellSizeHint(geohashLength, t)

  return (
    <div className="p-3">
      <div className="text-xs font-semibold text-brezn-muted">{t('geohash.searchRadius')}</div>
      <div className="mt-1 text-xs text-brezn-muted">
        {t('geohash.lengthLabel')}{' '}
        {geohashLength === 0 ? t('geohash.length0') : geohashLength} • {precisionLine}
      </div>
      {geoCell ? (
        <div className="mt-1 text-xs text-brezn-muted">
          {t('geohash.geoHashLabel')}{' '}
          <span className="rounded-lg bg-brezn-panel px-2 py-0.5 font-mono">{geoCell}</span>
        </div>
      ) : (
        <div className="mt-1 text-xs text-brezn-muted">{t('geohash.geoHashEmpty')}</div>
      )}
      <div className="mt-3 flex items-center gap-1">
        <button
          type="button"
          onClick={() => onGeohashLengthChange(Math.max(0, geohashLength - 1))}
          disabled={geohashLength === 0}
          className={`h-10 w-10 shrink-0 rounded-xl text-lg font-semibold disabled:cursor-not-allowed ${buttonBase}`}
          aria-label={t('geohash.decreaseRadius')}
        >
          -
        </button>
        <div className="px-2">
          <div className="text-sm font-semibold">
            {t('geohash.length', { n: geohashLength })}
          </div>
          <div className="text-xs text-brezn-muted">{lengthSubline}</div>
        </div>
        <button
          type="button"
          onClick={() => onGeohashLengthChange(Math.min(5, geohashLength + 1))}
          disabled={geohashLength === 5}
          className={`h-10 w-10 shrink-0 rounded-xl text-lg font-semibold disabled:cursor-not-allowed ${buttonBase}`}
          aria-label={t('geohash.increaseRadius')}
        >
          +
        </button>
      </div>
    </div>
  )
}
