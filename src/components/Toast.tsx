import { useCallback, useEffect, useMemo, useState } from 'react'
import { CloseIcon } from './CloseIcon'
import { ToastContext, type Toast, type ToastType } from './ToastContext'

export type { Toast, ToastType }

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 5000) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    const toast: Toast = { id, message, type, duration }
    setToasts(prev => [...prev, toast])

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }
  }, [removeToast])

  const contextValue = useMemo(() => ({ toasts, showToast, removeToast }), [toasts, showToast, removeToast])

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed left-1/2 z-[70] flex w-[calc(min(560px,100vw)-32px)] -translate-x-1/2 flex-col gap-2 top-2 top-[calc(env(safe-area-inset-top,0px)+0.5rem)]">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [isExiting, setIsExiting] = useState(false)

  const handleRemove = () => {
    setIsExiting(true)
    setTimeout(() => {
      onRemove(toast.id)
    }, 200)
  }

  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        setIsExiting(true)
        setTimeout(() => {
          onRemove(toast.id)
        }, 200)
      }, toast.duration)
      return () => clearTimeout(timer)
    }
  }, [toast.duration, toast.id, onRemove])

  const typeStyles = {
    info: 'border-brezn-border bg-brezn-panel/95',
    success: 'border-green-500/50 bg-green-500/10',
    error: 'border-brezn-danger/50 bg-brezn-danger/10',
    warning: 'border-yellow-500/50 bg-yellow-500/10',
  }

  const iconStyles = {
    info: 'text-brezn-muted',
    success: 'text-green-400',
    error: 'text-brezn-danger',
    warning: 'text-yellow-400',
  }

  return (
    <div
      className={[
        'rounded-lg border p-3 shadow-soft backdrop-blur transition-all duration-200',
        typeStyles[toast.type],
        isExiting ? 'opacity-0 translate-y-[-10px]' : 'opacity-100 translate-y-0',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 flex items-start gap-2">
          <div className={['shrink-0 text-lg', iconStyles[toast.type]].join(' ')}>
            {toast.type === 'success' && '✓'}
            {toast.type === 'error' && '✕'}
            {toast.type === 'warning' && '⚠'}
            {toast.type === 'info' && 'ℹ'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-brezn-text">{toast.message}</div>
          </div>
        </div>
        <button
          onClick={handleRemove}
          aria-label="Close"
          className="shrink-0 hover:opacity-80 focus:outline-none"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  )
}
