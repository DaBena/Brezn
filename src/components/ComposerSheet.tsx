import { type ChangeEvent, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buttonBase } from '../lib/buttonStyles'
import { CloseIcon } from './CloseIcon'
import { Sheet } from './Sheet'
import { uploadMediaFile, compressImage } from '../lib/mediaUpload'
import { isLikelyImageUrl, isLikelyVideoUrl } from '../lib/urls'
import { GeohashMap } from './GeohashMap'

export function ComposerSheet(props: {
  open: boolean
  onClose: () => void
  viewerGeo5: string | null
  onRequestLocation?: (onFinished?: () => void) => void
  onSelectCell?: (geohash5: string) => void
  onPublish: (content: string) => Promise<void>
  mediaUploadEndpoint?: string
}) {
  const { t } = useTranslation()
  const { open, onClose, viewerGeo5, onRequestLocation, onSelectCell, onPublish, mediaUploadEndpoint } = props

  const [composerText, setComposerText] = useState('')
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [showGeoMap, setShowGeoMap] = useState(false)
  const [publishState, setPublishState] = useState<'idle' | 'publishing' | 'error'>('idle')
  const [publishError, setPublishError] = useState<string | null>(null)

  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)

  const fileInputId = useId()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const maxImageBytes = 12 * 1024 * 1024
  const maxVideoBytes = 25 * 1024 * 1024

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0] ?? null
    e.currentTarget.value = ''
    if (!file) return
    if (!mediaUploadEndpoint) {
      setUploadState('error')
      setUploadError(t('composer.noUploadEndpoint'))
      return
    }

    const mime = (file.type ?? '').toLowerCase()
    const name = (file.name ?? '').toLowerCase()
    const isImage =
      mime.startsWith('image/') ||
      name.endsWith('.png') ||
      name.endsWith('.jpg') ||
      name.endsWith('.jpeg') ||
      name.endsWith('.gif') ||
      name.endsWith('.webp') ||
      name.endsWith('.avif') ||
      name.endsWith('.svg')
    const isVideo =
      mime.startsWith('video/') ||
      name.endsWith('.mp4') ||
      name.endsWith('.webm') ||
      name.endsWith('.mov') ||
      name.endsWith('.m4v') ||
      name.endsWith('.ogv')
    if (!isImage && !isVideo) {
      setUploadState('error')
      setUploadError(t('composer.onlyImagesVideos'))
      return
    }

    setUploadState('uploading')
    setUploadError(null)

    let fileToUpload = file
    if (isImage && !name.endsWith('.svg')) {
      try {
        fileToUpload = await compressImage(file, 1920, 1920, 0.85)
      } catch (err) {
        setUploadState('error')
        setUploadError(err instanceof Error ? err.message : t('composer.compressFailed'))
        return
      }
    }

    const limit = isVideo ? maxVideoBytes : maxImageBytes
    if (fileToUpload.size > limit) {
      setUploadState('error')
      setUploadError(isVideo ? t('composer.videoTooLarge') : t('composer.imageTooLarge'))
      return
    }

    try {
      const { url } = await uploadMediaFile({ endpoint: mediaUploadEndpoint, file: fileToUpload })
      setMediaUrls(prev => [...prev, url])
      setUploadState('idle')
    } catch (err) {
      setUploadState('error')
      setUploadError(err instanceof Error ? err.message : t('composer.uploadFailed'))
    }
  }

  async function publishPost() {
    const text = composerText.trim()
    if (!text && mediaUrls.length === 0) return
    
    // Combine text and media URLs
    const parts: string[] = []
    if (text) parts.push(text)
    if (mediaUrls.length > 0) {
      parts.push('')
      parts.push(...mediaUrls)
    }
    const content = parts.join('\n')
    
    setPublishState('publishing')
    setPublishError(null)
    try {
      await onPublish(content)
      setComposerText('')
      setMediaUrls([])
      setPublishState('idle')
      onClose()
    } catch (e) {
      setPublishState('error')
      setPublishError(e instanceof Error ? e.message : t('composer.publishFailed'))
    }
  }

  const cellLine = (
    <div className="text-xs font-semibold">
      {viewerGeo5 ? (
        <span>
          {t('composer.createInCell')}{' '}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              setShowGeoMap(v => !v)
            }}
            className="font-mono text-brezn-link underline underline-offset-2 hover:opacity-90"
            aria-label={t('composer.showMapAria', { cell: viewerGeo5 })}
            title={t('composer.showMapTitle')}
          >
            {viewerGeo5}
          </button>
        </span>
      ) : (
        t('composer.createNew')
      )}
    </div>
  )

  const headerToolbarBtn = `inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold ${buttonBase}`

  return (
    <Sheet
      open={open}
      titleElement={<span className="sr-only">{t('composer.srTitle')}</span>}
      headerStart={
        <button
          type="button"
          onClick={() => void publishPost()}
          disabled={
            publishState === 'publishing' ||
            uploadState === 'uploading' ||
            (!composerText.trim() && mediaUrls.length === 0)
          }
          aria-label={t('composer.publishAria')}
          className={headerToolbarBtn}
        >
          {publishState === 'publishing' ? t('composer.publishing') : t('composer.publish')}
        </button>
      }
      headerCenter={
        <>
          <input
            id={fileInputId}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={e => void handleFileChange(e)}
          />
          <label
            htmlFor={fileInputId}
            aria-label={t('composer.mediaAria')}
            className={`${headerToolbarBtn} max-w-full ${uploadState === 'uploading' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            tabIndex={uploadState === 'uploading' ? -1 : 0}
            role="button"
            onClick={e => {
              if (uploadState === 'uploading') e.preventDefault()
            }}
            onKeyDown={e => {
              if (uploadState === 'uploading') return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                const input = document.getElementById(fileInputId) as HTMLInputElement | null
                input?.click()
              }
            }}
          >
            {uploadState === 'uploading' ? t('composer.uploading') : t('composer.media')}
          </label>
        </>
      }
      onClose={onClose}
      scrollable={false}
    >
      <div className="mt-1">{cellLine}</div>

      {viewerGeo5 && showGeoMap ? (
        <div className="relative mt-2 h-[40vh] w-full overflow-hidden">
          <GeohashMap
            geohash={viewerGeo5}
            className="h-full w-full"
            onCellSelect={onSelectCell}
            onRequestLocation={onRequestLocation}
            gpsAriaLabel={t('geohashMap.gpsAria')}
            gpsTitle={t('geohashMap.gpsTitle')}
          />
        </div>
      ) : null}
      {mediaUrls.length > 0 ? (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {mediaUrls.map((url, idx) => {
            const isImage = isLikelyImageUrl(url)
            const isVideo = isLikelyVideoUrl(url)
            return (
              <div
                key={idx}
                className="group relative aspect-square overflow-hidden border border-brezn-text bg-brezn-panel"
              >
                {isImage ? (
                  <img
                    src={url}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={e => {
                      // Fallback to text if image fails to load
                      const target = e.currentTarget
                      target.style.display = 'none'
                      const parent = target.parentElement
                      if (parent) {
                        const fallback = document.createElement('div')
                        fallback.className = 'flex h-full items-center justify-center p-2'
                        fallback.innerHTML = `<span class="text-xs text-brezn-muted truncate">${url.length > 30 ? `${url.slice(0, 30)}...` : url}</span>`
                        parent.appendChild(fallback)
                      }
                    }}
                  />
                ) : isVideo ? (
                  <video
                    src={url}
                    className="h-full w-full object-cover"
                    preload="metadata"
                    muted
                    onError={e => {
                      // Fallback to text if video fails to load
                      const target = e.currentTarget
                      target.style.display = 'none'
                      const parent = target.parentElement
                      if (parent) {
                        const fallback = document.createElement('div')
                        fallback.className = 'flex h-full items-center justify-center p-2'
                        fallback.innerHTML = `<span class="text-xs text-brezn-muted truncate">${url.length > 30 ? `${url.slice(0, 30)}...` : url}</span>`
                        parent.appendChild(fallback)
                      }
                    }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-2">
                    <span className="text-xs text-brezn-muted truncate" title={url}>
                      {url.length > 30 ? `${url.slice(0, 30)}...` : url}
                    </span>
                  </div>
                )}
                <button
                  onClick={e => {
                    e.stopPropagation()
                    setMediaUrls(prev => prev.filter((_, i) => i !== idx))
                  }}
                  aria-label={t('composer.removeMediaAria')}
                  className="absolute right-0.5 top-0.5 rounded p-0.5 focus:outline-none"
                >
                  <CloseIcon size={14} />
                </button>
              </div>
            )
          })}
        </div>
      ) : null}
      <textarea
        ref={textareaRef}
        value={composerText}
        onChange={e => {
          setComposerText(e.target.value)
          // Auto-resize textarea
          const el = e.target
          el.style.height = 'auto'
          el.style.height = `${Math.min(el.scrollHeight, 300)}px`
        }}
        placeholder={t('composer.placeholder')}
        className="mt-2 mb-[env(safe-area-inset-bottom)] min-h-[120px] w-full resize-none border border-brezn-text p-3 text-base outline-none"
        rows={5}
      />
      {publishState === 'error' && publishError ? (
        <div className="mt-2 text-sm text-brezn-error">{publishError}</div>
      ) : null}
      {uploadState === 'error' && uploadError ? (
        <div className="mt-2 text-sm text-brezn-error">{uploadError}</div>
      ) : null}
    </Sheet>
  )
}

