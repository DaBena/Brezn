import { type ChangeEvent, useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buttonBase } from '../lib/buttonStyles'
import { CloseIcon } from './CloseIcon'
import { Sheet } from './Sheet'
import { uploadMediaFile, compressImage } from '../lib/mediaUpload'
import { isMp4OrMovFile, stripMp4ContainerMetadata } from '../lib/stripMp4Metadata'
import { isLikelyImageUrl, isLikelyVideoUrl } from '../lib/urls'
import { GeohashMap } from './GeohashMap'
import { parsePublishGeohashInput } from '../lib/geo'

export function ComposerSheet(props: {
  open: boolean
  onClose: () => void
  viewerGeo5: string | null
  onRequestLocation?: (onFinished?: () => void) => void
  onSelectCell?: (geohash5: string) => void
  onPublish: (content: string, publishGeohash?: string | null) => Promise<void>
  mediaUploadEndpoint?: string
  postGeo5?: string[]
}) {
  const { t } = useTranslation()
  const {
    open,
    onClose,
    viewerGeo5,
    onRequestLocation,
    onSelectCell,
    onPublish,
    mediaUploadEndpoint,
    postGeo5,
  } = props

  const [composerText, setComposerText] = useState('')
  const [manualGeohashMode, setManualGeohashMode] = useState(false)
  const [publishGeohashDraft, setPublishGeohashDraft] = useState('')
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [showGeoMap, setShowGeoMap] = useState(false)
  const [mapRelayoutTick, setMapRelayoutTick] = useState(0)
  const [publishState, setPublishState] = useState<'idle' | 'publishing' | 'error'>('idle')
  const [publishError, setPublishError] = useState<string | null>(null)

  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)

  const fileInputId = useId()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!showGeoMap || manualGeohashMode) return
    const t = window.setTimeout(() => setMapRelayoutTick((n) => n + 1), 0)
    return () => window.clearTimeout(t)
  }, [showGeoMap, manualGeohashMode])

  const handleClose = () => {
    if (manualGeohashMode) {
      setComposerText('')
      setMediaUrls([])
      setManualGeohashMode(false)
      setShowGeoMap(false)
    }
    setPublishGeohashDraft('')
    setPublishError(null)
    setPublishState('idle')
    onClose()
  }

  const enterManualGeohashMode = () => {
    if (!viewerGeo5) return
    setShowGeoMap(false)
    setManualGeohashMode(true)
    setPublishGeohashDraft(viewerGeo5)
  }

  const wrappedRequestLocationForMap = useCallback(
    (done?: () => void) => {
      if (!onRequestLocation) return
      onRequestLocation(() => {
        setMapRelayoutTick((n) => n + 1)
        done?.()
      })
    },
    [onRequestLocation],
  )

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
    } else if (isVideo && isMp4OrMovFile(file)) {
      try {
        fileToUpload = await stripMp4ContainerMetadata(file)
      } catch {
        fileToUpload = file
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
      setMediaUrls((prev) => [...prev, url])
      setUploadState('idle')
    } catch (err) {
      setUploadState('error')
      setUploadError(err instanceof Error ? err.message : t('composer.uploadFailed'))
    }
  }

  async function publishPost() {
    const text = composerText.trim()
    if (!text && mediaUrls.length === 0) return

    let publishOverride: string | null = null
    if (manualGeohashMode) {
      const parsed = parsePublishGeohashInput(publishGeohashDraft)
      if (parsed.kind !== 'override') {
        setPublishState('error')
        setPublishError(t('composer.invalidGeohash'))
        return
      }
      publishOverride = parsed.geohash
    }

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
      await onPublish(content, publishOverride)
      setComposerText('')
      setPublishGeohashDraft('')
      setMediaUrls([])
      setManualGeohashMode(false)
      setShowGeoMap(false)
      setPublishState('idle')
      handleClose()
    } catch (e) {
      setPublishState('error')
      setPublishError(e instanceof Error ? e.message : t('composer.publishFailed'))
    }
  }

  const composeFieldClass = 'border border-brezn-text text-base font-normal text-brezn-text outline-none'
  const geohashInputClass = `inline-block min-w-[6ch] max-w-[14ch] bg-brezn-bg px-1.5 py-0.5 ${composeFieldClass}`

  const cellLine = (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs">
      {viewerGeo5 ? (
        <>
          <span className="font-semibold">{t('composer.createInCell')}</span>
          {manualGeohashMode ? (
            <input
              type="text"
              value={publishGeohashDraft}
              onChange={(e) => setPublishGeohashDraft(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className={geohashInputClass}
              aria-label={t('composer.editGeohashAria')}
            />
          ) : (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowGeoMap((v) => !v)
                }}
                className="font-mono text-brezn-link underline underline-offset-2 hover:opacity-90"
                aria-label={t('composer.showMapAria', { cell: viewerGeo5 })}
                title={t('composer.showMapTitle')}
              >
                {viewerGeo5}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  enterManualGeohashMode()
                }}
                className="inline-flex shrink-0 items-center rounded px-0.5 font-normal leading-none hover:opacity-80"
                aria-label={t('composer.editGeohashAria')}
              >
                ✎
              </button>
            </>
          )}
        </>
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
      headerEnd={
        <>
          <input
            id={fileInputId}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => void handleFileChange(e)}
          />
          <label
            htmlFor={fileInputId}
            aria-label={t('composer.mediaAria')}
            className={`${headerToolbarBtn} max-w-full ${uploadState === 'uploading' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            tabIndex={uploadState === 'uploading' ? -1 : 0}
            role="button"
            onClick={(e) => {
              if (uploadState === 'uploading') e.preventDefault()
            }}
            onKeyDown={(e) => {
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
      onClose={handleClose}
      scrollable={false}
    >
      <div className="mt-1">{cellLine}</div>

      {viewerGeo5 && showGeoMap && !manualGeohashMode ? (
        <div className="relative mt-2 h-[40vh] w-full overflow-hidden">
          <GeohashMap
            geohash={viewerGeo5}
            className="h-full w-full"
            onCellSelect={onSelectCell}
            onRequestLocation={onRequestLocation ? wrappedRequestLocationForMap : undefined}
            gpsAriaLabel={t('geohashMap.gpsAria')}
            gpsTitle={t('geohashMap.gpsTitle')}
            postGeo5={postGeo5}
            mapRelayoutTick={mapRelayoutTick}
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
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                    onError={(e) => {
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
                    referrerPolicy="no-referrer"
                    onError={(e) => {
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
                  onClick={(e) => {
                    e.stopPropagation()
                    setMediaUrls((prev) => prev.filter((_, i) => i !== idx))
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
        onChange={(e) => {
          setComposerText(e.target.value)
          const el = e.target
          el.style.height = 'auto'
          el.style.height = `${Math.min(el.scrollHeight, 300)}px`
        }}
        placeholder={t('composer.placeholder')}
        className={`mt-2 mb-[env(safe-area-inset-bottom)] min-h-[120px] w-full resize-none p-3 ${composeFieldClass}`}
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
