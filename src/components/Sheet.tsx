import { useEffect, useId, useRef } from 'react'

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')
  const all = Array.from(root.querySelectorAll<HTMLElement>(selector))
  return all.filter(el => {
    // Skip hidden/disabled-ish elements.
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    if (el.getAttribute('aria-hidden') === 'true') return false
    if (el.hasAttribute('disabled')) return false
    return true
  })
}

export function Sheet(props: {
  open: boolean
  title?: string
  titleElement?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  zIndexClassName?: string
  dismissible?: boolean
}) {
  const { open, title, titleElement, onClose, children, zIndexClassName, dismissible = true } = props
  const reactId = useId()
  const titleId = `sheet-${reactId}`
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const lastActiveElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    lastActiveElementRef.current = (document.activeElement as HTMLElement | null) ?? null

    // Best-effort scroll lock while modal is open.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Initial focus: close button first (consistent), otherwise first focusable in dialog.
    const focusTimer = window.setTimeout(() => {
      const closeBtn = closeButtonRef.current
      if (dismissible && closeBtn) {
        closeBtn.focus()
        return
      }
      const dialog = dialogRef.current
      if (!dialog) return
      const focusables = getFocusableElements(dialog)
      focusables[0]?.focus()
    }, 0)

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (!dismissible) return
        e.preventDefault()
        onClose()
        return
      }

      if (e.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return

      const focusables = getFocusableElements(dialog)
      if (!focusables.length) {
        e.preventDefault()
        return
      }

      const active = document.activeElement as HTMLElement | null
      const idx = active ? focusables.indexOf(active) : -1
      const goingBack = e.shiftKey

      // If focus is outside the dialog, force it inside.
      if (idx === -1) {
        e.preventDefault()
        ;(goingBack ? focusables[focusables.length - 1] : focusables[0]).focus()
        return
      }

      if (!goingBack && idx === focusables.length - 1) {
        e.preventDefault()
        focusables[0].focus()
        return
      }

      if (goingBack && idx === 0) {
        e.preventDefault()
        focusables[focusables.length - 1].focus()
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)

      // Return focus to the element that opened the sheet (best-effort).
      const prev = lastActiveElementRef.current
      if (prev && typeof prev.focus === 'function') {
        try {
          prev.focus()
        } catch {
          // ignore
        }
      }
    }
  }, [open, onClose, dismissible])

  if (!open) return null

  return (
    <div className={`fixed inset-0 ${zIndexClassName ?? 'z-50'}`}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={dismissible ? onClose : undefined} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={[
          // mobile: bottom-sheet
          'absolute bottom-0 left-0 right-0 mx-auto w-full max-w-xl',
          // desktop: centered modal
          'sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl',
          // sizing / scrolling
          'max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)]',
          'overflow-hidden',
          // layout
          'flex flex-col',
          // visuals
          'rounded-t-3xl border border-brezn-border bg-brezn-panel shadow-soft',
          // spacing
          'p-4',
        ].join(' ')}
      >
        <div className="flex items-center justify-between">
          {titleElement ? (
            <div id={titleId}>{titleElement}</div>
          ) : title ? (
            <div id={titleId} className="text-sm font-semibold">
              {title}
            </div>
          ) : null}
          {dismissible ? (
            <button
              ref={closeButtonRef}
              onClick={onClose}
              aria-label="Schließen"
              className="rounded-xl border border-brezn-border bg-brezn-panel2 px-3 py-2 text-lg font-semibold leading-none hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-gold/40"
            >
              <span className="text-red-500">×</span>
            </button>
          ) : null}
        </div>
        <div className="hide-scrollbar mt-3 flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-[env(safe-area-inset-bottom)]">
          {children}
        </div>
      </div>
    </div>
  )
}

