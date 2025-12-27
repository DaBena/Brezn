import { useEffect, useId, useRef, useState } from 'react'
import { Sheet } from './Sheet'
import { uploadMediaFile } from '../lib/mediaUpload'

export function ComposerSheet(props: {
  open: boolean
  onClose: () => void
  viewerGeo5: string | null
  onPublish: (content: string) => Promise<void>
  mediaUploadEndpoint?: string
}) {
  const { open, onClose, viewerGeo5, onPublish, mediaUploadEndpoint } = props

  const [composerText, setComposerText] = useState('')
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [publishState, setPublishState] = useState<'idle' | 'publishing' | 'error'>('idle')
  const [publishError, setPublishError] = useState<string | null>(null)

  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)

  const fileInputId = useId()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const maxImageBytes = 12 * 1024 * 1024
  const maxVideoBytes = 25 * 1024 * 1024

  // Reset state when sheet closes
  useEffect(() => {
    if (!open) {
      setComposerText('')
      setMediaUrls([])
      setUploadState('idle')
      setUploadError(null)
      setPublishState('idle')
      setPublishError(null)
    }
  }, [open])

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
    <Sheet open={open} title="Neuen lokalen Post erstellen" onClose={onClose} scrollable={false}>
      {viewerGeo5 ? (
        <div className="mt-2 text-xs text-brezn-muted">
          in Cell <span className="font-mono">{viewerGeo5}</span>
        </div>
      ) : null}
      {mediaUrls.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {mediaUrls.map((url, idx) => (
            <div
              key={idx}
              className="group flex items-center gap-1.5 rounded-xl border border-brezn-border bg-brezn-panel2 px-2.5 py-1.5"
            >
              <span className="text-xs text-brezn-muted truncate max-w-[200px]" title={url}>
                {url.length > 30 ? `${url.slice(0, 30)}...` : url}
              </span>
              <button
                onClick={() => setMediaUrls(prev => prev.filter((_, i) => i !== idx))}
                aria-label="Medien entfernen"
                className="shrink-0 rounded text-red-500 hover:bg-brezn-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
              >
                <span className="text-sm leading-none">×</span>
              </button>
            </div>
          ))}
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
        placeholder="Was geht in deiner Gegend?"
        className="mt-3 min-h-[120px] w-full resize-none rounded-2xl border border-brezn-border bg-brezn-panel2 p-3 text-base sm:text-sm outline-none focus:ring-2 focus:ring-brezn-gold/40"
        rows={5}
      />
      {publishState === 'error' && publishError ? <div className="mt-2 text-sm text-brezn-danger">{publishError}</div> : null}
      {uploadState === 'error' && uploadError ? <div className="mt-2 text-sm text-brezn-danger">{uploadError}</div> : null}
      <div className="sticky bottom-0 -mx-4 mt-3 border-t border-brezn-border bg-brezn-panel px-4 pb-[env(safe-area-inset-bottom)] pt-3">
        <div className="flex flex-col gap-2 sm:flex-row">
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
                setUploadError('Kein Upload-Endpunkt konfiguriert (Filter → Medien-Upload).')
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
                setUploadError('Nur Bilder oder Videos werden unterstützt.')
                return
              }

              const limit = isVideo ? maxVideoBytes : maxImageBytes
              if (file.size > limit) {
                setUploadState('error')
                setUploadError(isVideo ? 'Video ist zu groß (max. 25 MB).' : 'Bild ist zu groß (max. 12 MB).')
                return
              }

              setUploadState('uploading')
              setUploadError(null)
              try {
                const { url } = await uploadMediaFile({ endpoint: mediaUploadEndpoint, file })
                setMediaUrls(prev => [...prev, url])
                setUploadState('idle')
              } catch (err) {
                setUploadState('error')
                setUploadError(err instanceof Error ? err.message : 'Upload fehlgeschlagen.')
              }
            }}
          />

          <label
            htmlFor={fileInputId}
            className={[
              'rounded-2xl border border-brezn-border bg-brezn-panel2 px-4 py-3.5 text-sm font-semibold',
              'min-h-[44px] flex items-center justify-center',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40',
              uploadState === 'uploading' ? 'opacity-60 cursor-not-allowed' : 'hover:bg-brezn-panel cursor-pointer active:opacity-90',
            ].join(' ')}
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
            {uploadState === 'uploading' ? 'Upload…' : 'Medien'}
          </label>

          <button
            onClick={publishPost}
            disabled={publishState === 'publishing' || uploadState === 'uploading' || (!composerText.trim() && mediaUrls.length === 0)}
            aria-label="Beitrag posten"
            className="flex-1 rounded-2xl bg-brezn-gold px-4 py-3.5 text-sm font-semibold text-white min-h-[44px] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40 active:opacity-90"
          >
            {publishState === 'publishing' ? 'Sende…' : 'Posten'}
          </button>
          <button
            onClick={() => {
              setComposerText('')
              setMediaUrls([])
              setUploadState('idle')
              setUploadError(null)
              onClose()
            }}
            className="rounded-2xl border border-brezn-border bg-brezn-panel2 px-4 py-3.5 text-sm min-h-[44px] hover:bg-brezn-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40 active:opacity-90 sm:hidden"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </Sheet>
  )
}

