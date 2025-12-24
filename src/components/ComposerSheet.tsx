import { useId, useRef, useState } from 'react'
import { Sheet } from './Sheet'
import { uploadMediaFile } from '../lib/mediaUpload'

export function ComposerSheet(props: {
  open: boolean
  onClose: () => void
  geoCell: string | null
  onPublish: (content: string) => Promise<void>
  mediaUploadEndpoint?: string
}) {
  const { open, onClose, geoCell, onPublish, mediaUploadEndpoint } = props

  const [composerText, setComposerText] = useState('')
  const [publishState, setPublishState] = useState<'idle' | 'publishing' | 'error'>('idle')
  const [publishError, setPublishError] = useState<string | null>(null)

  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)

  const fileInputId = useId()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const maxImageBytes = 12 * 1024 * 1024
  const maxVideoBytes = 25 * 1024 * 1024

  function insertAtCursor(textToInsert: string) {
    const el = textareaRef.current
    if (!el) {
      setComposerText(t => (t ? `${t}\n${textToInsert}` : textToInsert))
      return
    }
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const before = composerText.slice(0, start)
    const after = composerText.slice(end)
    const next = `${before}${textToInsert}${after}`
    setComposerText(next)
    queueMicrotask(() => {
      try {
        el.focus()
        const pos = start + textToInsert.length
        el.setSelectionRange(pos, pos)
      } catch {
        // ignore
      }
    })
  }

  async function publishPost() {
    const content = composerText.trim()
    if (!content) return
    setPublishState('publishing')
    setPublishError(null)
    try {
      await onPublish(content)
      setComposerText('')
      setPublishState('idle')
      onClose()
    } catch (e) {
      setPublishState('error')
      setPublishError(e instanceof Error ? e.message : 'Publish failed.')
    }
  }

  return (
    <Sheet open={open} title="Neuen lokalen Post erstellen" onClose={onClose}>
      {geoCell ? (
        <div className="mt-2 text-xs text-brezn-muted">
          in Cell <span className="font-mono">{geoCell}</span>
        </div>
      ) : null}
      <textarea
        ref={textareaRef}
        value={composerText}
        onChange={e => setComposerText(e.target.value)}
        placeholder="Was geht in deiner Gegend?"
        className="mt-3 h-28 w-full resize-none rounded-2xl border border-brezn-border bg-brezn-panel2 p-3 text-sm outline-none focus:ring-2 focus:ring-brezn-gold/40"
      />
      {publishState === 'error' && publishError ? <div className="mt-2 text-sm text-brezn-danger">{publishError}</div> : null}
      {uploadState === 'error' && uploadError ? <div className="mt-2 text-sm text-brezn-danger">{uploadError}</div> : null}
      <div className="sticky bottom-0 -mx-4 mt-3 border-t border-brezn-border bg-brezn-panel px-4 pb-[env(safe-area-inset-bottom)] pt-3">
        <div className="flex gap-2">
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
                const prefix = composerText.trim().length ? '\n' : ''
                insertAtCursor(`${prefix}${url}\n`)
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
              'rounded-2xl border border-brezn-border bg-brezn-panel2 px-4 py-3 text-sm font-semibold',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40',
              uploadState === 'uploading' ? 'opacity-60 cursor-not-allowed' : 'hover:bg-brezn-panel cursor-pointer',
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
            disabled={publishState === 'publishing' || uploadState === 'uploading' || !composerText.trim()}
            aria-label="Beitrag posten"
            className="flex-1 rounded-2xl bg-brezn-gold px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
          >
            {publishState === 'publishing' ? 'Sende…' : 'Posten'}
          </button>
          <button
            onClick={() => {
              setComposerText('')
              setUploadState('idle')
              setUploadError(null)
              onClose()
            }}
            className="rounded-2xl border border-brezn-border bg-brezn-panel2 px-4 py-3 text-sm hover:bg-brezn-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </Sheet>
  )
}

