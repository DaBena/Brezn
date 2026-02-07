
import { useId, useRef, useState } from 'react'
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
      setPublishError(e instanceof Error ? e.message : 'Publish failed.')
    }
  }

  return (
    <Sheet
      open={open}
      titleElement={
        <div className="text-xs font-semibold">
          {viewerGeo5 ? (
            <span>
              create new post in cell{' '}
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  setShowGeoMap(v => !v)
                }}
                className="font-mono underline underline-offset-2 text-blue-500 hover:text-blue-400"
                aria-label={`Show cell ${viewerGeo5} on map`}
                title="Show cell on map"
              >
                {viewerGeo5}
              </button>
            </span>
          ) : (
            'create new post'
          )}
        </div>
      }
      onClose={onClose}
      scrollable={false}
    >
      {viewerGeo5 && showGeoMap ? (
        <div className="relative mt-2 h-[40vh] w-full overflow-hidden">
          <GeohashMap
            geohash={viewerGeo5}
            className="h-full w-full"
            onCellSelect={onSelectCell}
            onRequestLocation={onRequestLocation}
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
                className="group relative aspect-square overflow-hidden border border-brezn-border bg-brezn-panel2"
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
                  aria-label="Remove media"
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
        placeholder="What's happening in your area?"
        className="mt-3 min-h-[120px] w-full resize-none border border-brezn-border bg-brezn-panel2 p-3 text-base sm:text-sm outline-none"
        rows={5}
      />
      {publishState === 'error' && publishError ? <div className="mt-2 text-sm text-brezn-danger">{publishError}</div> : null}
      {uploadState === 'error' && uploadError ? <div className="mt-2 text-sm text-brezn-danger">{uploadError}</div> : null}
      <div className="sticky bottom-0 -mx-4 mt-3 bg-brezn-panel px-4 pb-[env(safe-area-inset-bottom)] pt-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            id={fileInputId}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={async e => {
              const file = e.currentTarget.files?.[0] ?? null
              // allow selecting the same file again
              e.currentTarget.value = ''
              if (!file) return
              if (!mediaUploadEndpoint) {
                setUploadState('error')
                setUploadError('No upload endpoint configured (Settings → Media Upload).')
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
                setUploadError('Only images or videos are supported.')
                return
              }

              // Set uploading state early so compression happens in background
              setUploadState('uploading')
              setUploadError(null)

              // Compress images before checking size limit (skip SVG as it's vector graphics)
              let fileToUpload = file
              if (isImage && !name.endsWith('.svg')) {
                try {
                  fileToUpload = await compressImage(file, 1920, 1920, 0.85)
                } catch (err) {
                  setUploadState('error')
                  setUploadError(err instanceof Error ? err.message : 'Failed to compress image.')
                  return
                }
              }

              const limit = isVideo ? maxVideoBytes : maxImageBytes
              if (fileToUpload.size > limit) {
                setUploadState('error')
                setUploadError(isVideo ? 'Video is too large (max. 25 MB).' : 'Image is too large (max. 12 MB).')
                return
              }

              try {
                const { url } = await uploadMediaFile({ endpoint: mediaUploadEndpoint, file: fileToUpload })
                setMediaUrls(prev => [...prev, url])
                setUploadState('idle')
              } catch (err) {
                setUploadState('error')
                setUploadError(err instanceof Error ? err.message : 'Upload failed.')
              }
            }}
          />

          <label
            htmlFor={fileInputId}
            className={`w-full sm:w-auto sm:flex-shrink-0 rounded-lg px-4 py-3.5 sm:px-3 sm:py-2 text-sm sm:text-[11px] font-semibold min-h-[44px] flex items-center justify-center ${buttonBase} ${uploadState === 'uploading' ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            tabIndex={uploadState === 'uploading' ? -1 : 0}
            role="button"
            onClick={e => {
              if (uploadState === 'uploading') e.preventDefault()
            }}
            onKeyDown={e => {
              if (uploadState === 'uploading') return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                // Trigger the associated input click.
                const input = document.getElementById(fileInputId) as HTMLInputElement | null
                input?.click()
              }
            }}
          >
            {uploadState === 'uploading' ? 'Uploading…' : 'Media'}
          </label>

          <div className="hidden sm:block sm:flex-1" />

          <button
            onClick={publishPost}
            disabled={publishState === 'publishing' || uploadState === 'uploading' || (!composerText.trim() && mediaUrls.length === 0)}
            aria-label="Publish post"
            className={`w-full sm:w-[30%] rounded-lg px-4 py-3.5 text-sm font-semibold min-h-[44px] ${buttonBase}`}
          >
            {publishState === 'publishing' ? 'Publishing…' : 'Publish'}
          </button>

          <div className="hidden sm:block sm:flex-1" />
        </div>
      </div>
    </Sheet>
  )
}

