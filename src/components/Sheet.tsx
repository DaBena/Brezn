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
  const touchStartY = useRef<number | null>(null)
  const touchStartTime = useRef<number | null>(null)
  const touchStartElementY = useRef<number | null>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null)
  const isScrolling = useRef<boolean>(false)
  const scrollableElementRef = useRef<HTMLElement | null>(null)
  const headerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      /* eslint-disable react-hooks/set-state-in-effect -- reset swipe state when sheet closes */
      setSwipeOffset(0)
      setSwipeDirection(null)
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    lastActiveElementRef.current = (document.activeElement as HTMLElement | null) ?? null

    // Best-effort scroll lock while modal is open.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Find scrollable element
    const dialog = dialogRef.current
    if (dialog) {
      const scrollableEl = dialog.querySelector<HTMLElement>('.hide-scrollbar, [class*="overflow-y-auto"]')
      scrollableElementRef.current = scrollableEl ?? null
    }

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

  // Check if element is scrollable and at top/bottom
  const isScrollableAtEdge = (element: HTMLElement | null, deltaY: number): boolean => {
    if (!element) return false
    const { scrollTop, scrollHeight, clientHeight } = element
    const isAtTop = scrollTop === 0
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1
    // Only allow swipe if at edge and scrolling in that direction
    if (deltaY < 0 && isAtTop) return true
    if (deltaY > 0 && isAtBottom) return true
    return false
  }

  // Swipe gesture handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!dismissible) return
    
    const touch = e.touches[0]
    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    
    // Get Y position relative to the dialog element
    const elementY = touch.clientY - rect.top
    
    touchStartX.current = touch.clientX
    touchStartY.current = touch.clientY
    touchStartElementY.current = elementY
    touchStartTime.current = Date.now()
    isScrolling.current = false
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dismissible || touchStartX.current === null || touchStartY.current === null || touchStartElementY.current === null) return
    
    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const deltaX = currentX - touchStartX.current
    const deltaY = currentY - touchStartY.current
    
    // Check if user is primarily scrolling vertically
    const absDeltaX = Math.abs(deltaX)
    const absDeltaY = Math.abs(deltaY)
    
    // If vertical movement is significantly more than horizontal, treat as scroll
    if (absDeltaY > absDeltaX * 1.5) {
      isScrolling.current = true
      setSwipeOffset(0)
      setSwipeDirection(null)
      return
    }
    
    // Only allow swipe if touch started in header area (first ~80px) or at scroll edge
    const headerHeight = 80 // Approximate header height including padding
    const startedInHeader = touchStartElementY.current < headerHeight
    
    // Only allow horizontal swipe if:
    // 1. Horizontal movement is dominant, AND
    // 2. Either started in header, or at scroll edge in the direction of movement
    if (absDeltaX > 10 && absDeltaX > absDeltaY) {
      // If not in header, check if we're at scroll edge
      if (!startedInHeader && absDeltaY > 0) {
        const atEdge = isScrollableAtEdge(scrollableElementRef.current, deltaY)
        if (!atEdge) {
          // Not at edge and not in header, cancel swipe gesture
          isScrolling.current = true
          setSwipeOffset(0)
          setSwipeDirection(null)
          return
        }
      }
      
      // Determine direction on first significant movement
      setSwipeDirection(prev => (prev === null ? (deltaX < 0 ? 'left' : 'right') : prev))
      setSwipeOffset(absDeltaX)
    }
  }

  const handleTouchEnd = () => {
    if (!dismissible || touchStartX.current === null) {
      setSwipeOffset(0)
      setSwipeDirection(null)
      isScrolling.current = false
      touchStartElementY.current = null
      return
    }

    // Don't close if user was scrolling
    if (isScrolling.current) {
      setSwipeOffset(0)
      setSwipeDirection(null)
      touchStartX.current = null
      touchStartY.current = null
      touchStartTime.current = null
      touchStartElementY.current = null
      isScrolling.current = false
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
    setSwipeDirection(null)
    touchStartX.current = null
    touchStartY.current = null
    touchStartTime.current = null
    touchStartElementY.current = null
    isScrolling.current = false
  }

  if (!open) return null

  const opacity = swipeOffset > 0 ? Math.max(0, 1 - swipeOffset / 300) : 1

  return (
    <div className={`fixed inset-0 ${zIndexClassName ?? 'z-50'}`}>
      <div 
        className="absolute inset-0 backdrop-blur-sm"
        style={{ opacity, backgroundColor: 'var(--brezn-overlay)' }}
        onClick={dismissible ? onClose : undefined}
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
          'absolute top-[calc(env(safe-area-inset-top,0px)+0.5rem)] left-0 right-0 mx-auto w-full max-w-xl',
          'max-h-[calc(100dvh-env(safe-area-inset-top,0px)-0.5rem)] overflow-hidden flex flex-col',
          'border shadow-soft p-2 transition-transform duration-200 ease-out',
        ].join(' ')}
        style={{
          transform: swipeOffset > 0 
            ? `translateX(${swipeDirection === 'left' ? '-' : ''}${swipeOffset}px)` 
            : undefined,
          backgroundColor: 'var(--brezn-panel)',
          borderColor: 'var(--brezn-border)',
        }}
      >
        <div ref={headerRef} className="flex items-center justify-between">
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
              className="ml-auto shrink-0 rounded-xl p-2 hover:opacity-80 focus:outline-none"
              style={{
                backgroundColor: 'var(--brezn-button)',
                color: 'var(--brezn-text)',
              }}
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

