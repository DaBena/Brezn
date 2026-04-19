import { useTranslation } from 'react-i18next'
import { buttonBase } from '../../lib/buttonStyles'
import { DEFAULT_NIP96_SERVER } from '../../lib/mediaUpload'

type MediaUploadSettingsProps = {
  mediaEndpoint: string
  onMediaEndpointChange: (endpoint: string) => void
}

export function MediaUploadSettings({
  mediaEndpoint,
  onMediaEndpointChange,
}: MediaUploadSettingsProps) {
  const { t } = useTranslation()

  return (
    <div className="p-3">
      <div className="text-xs font-semibold text-brezn-muted">{t('mediaUpload.title')}</div>
      <div className="mt-1 text-xs text-brezn-muted">
        {t('mediaUpload.hint', { default: DEFAULT_NIP96_SERVER })}
      </div>

      <div className="mt-2 flex gap-2">
        <input
          value={mediaEndpoint}
          onChange={(e) => onMediaEndpointChange(e.target.value)}
          placeholder={DEFAULT_NIP96_SERVER}
          className="w-full border border-brezn-text p-2 text-base outline-none"
        />
        <button
          type="button"
          onClick={() => onMediaEndpointChange(DEFAULT_NIP96_SERVER)}
          className={`shrink-0 rounded-xl px-3 py-2 text-xs ${buttonBase}`}
        >
          {t('mediaUpload.defaultBtn')}
        </button>
      </div>
    </div>
  )
}
