import { useEffect, useId, useRef, useState } from 'react'
import { CloseIcon } from './CloseIcon'

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
  scrollable?: boolean
}) {
  const { open, title, titleElement, onClose, children, zIndexClassName, dismissible = true, scrollable = true } = props
  const reactId = useId()
  const titleId = `sheet-${reactId}`
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const lastActiveElementRef = useRef<HTMLElement | null>(null)
  
  // Swipe gesture state
  const touchStartX = useRef<number | null>(null)
  const touchStartTime = useRef<number | null>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const swipeDirection = useRef<'left' | 'right' | null>(null)

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

  // Swipe gesture handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!dismissible) return
    touchStartX.current = e.touches[0].clientX
    touchStartTime.current = Date.now()
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dismissible || touchStartX.current === null) return
    
    const currentX = e.touches[0].clientX
    const deltaX = currentX - touchStartX.current
    
    // Allow swipes in both directions
    if (Math.abs(deltaX) > 10) {
      // Determine direction on first significant movement
      if (swipeDirection.current === null) {
        swipeDirection.current = deltaX < 0 ? 'left' : 'right'
      }
      setSwipeOffset(Math.abs(deltaX))
    }
  }

  const handleTouchEnd = () => {
    if (!dismissible || touchStartX.current === null) {
      setSwipeOffset(0)
      swipeDirection.current = null
      return
    }

    const minSwipeDistance = 50
    const maxSwipeTime = 300
    
    const swipeTime = touchStartTime.current ? Date.now() - touchStartTime.current : Infinity
    
    // Close on swipe in either direction if threshold is met
    if (swipeOffset > minSwipeDistance && swipeTime < maxSwipeTime) {
      onClose()
    }
    
    setSwipeOffset(0)
    swipeDirection.current = null
    touchStartX.current = null
    touchStartTime.current = null
  }

  if (!open) return null

  const opacity = swipeOffset > 0 ? Math.max(0, 1 - swipeOffset / 300) : 1

  return (
    <div className={`fixed inset-0 ${zIndexClassName ?? 'z-50'}`}>
      <div 
        className="absolute inset-0 bg-black/75 backdrop-blur-sm" 
        onClick={dismissible ? onClose : undefined}
        style={{ opacity }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={[
          // mobile: positioned at top to avoid keyboard, with small margin
          'absolute top-2 top-[calc(env(safe-area-inset-top,0px)+0.5rem)] left-0 right-0 mx-auto w-full max-w-xl',
          // desktop: centered modal
          'sm:top-1/2 sm:-translate-y-1/2 sm:rounded-xl',
          // sizing / scrolling
          'max-h-[calc(100dvh-env(safe-area-inset-top,0px))] sm:max-h-[calc(100dvh-2rem)]',
          'overflow-hidden',
          // layout
          'flex flex-col',
          // visuals
          'rounded-t-xl border border-brezn-border bg-brezn-panel shadow-soft',
          // spacing
          'p-2',
          // swipe transition
          'transition-transform duration-200 ease-out',
        ].join(' ')}
        style={{
          transform: swipeOffset > 0 
            ? `translateX(${swipeDirection.current === 'left' ? '-' : ''}${swipeOffset}px)` 
            : undefined,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            {titleElement ? (
              <div id={titleId}>{titleElement}</div>
            ) : title ? (
              <div id={titleId} className="text-sm font-semibold">
                {title}
              </div>
            ) : null}
          </div>
          {dismissible ? (
            <button
              ref={closeButtonRef}
              onClick={onClose}
              aria-label="Close"
              className={`ml-auto shrink-0 rounded-xl p-2 hover:opacity-80 focus:outline-none bg-[#4a4a52]`}
            >
              <CloseIcon size={24} />
            </button>
          ) : null}
        </div>
        <div className={[
          'mt-1.5 flex-1 min-h-0 overflow-x-hidden pb-[env(safe-area-inset-bottom)]',
          scrollable ? 'hide-scrollbar overflow-y-auto' : 'overflow-y-visible',
        ].join(' ')}>
          {children}
        </div>
      </div>
    </div>
  )
}

