import React from 'react'

export type ToastType = 'info' | 'success' | 'error' | 'warning'

export type Toast = {
  id: string
  message: string
  type: ToastType
  duration?: number // in ms, default: 5000
}

export type ToastContextValue = {
  toasts: Toast[]
  showToast: (message: string, type?: ToastType, duration?: number) => void
  removeToast: (id: string) => void
}

export const ToastContext = React.createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}
