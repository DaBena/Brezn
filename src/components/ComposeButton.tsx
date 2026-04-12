import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'

interface ComposeButtonProps {
  onClick: () => void
}

export function ComposeButton({ onClick }: ComposeButtonProps) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('composeBtn.aria')}
      className={cn(
        'pointer-events-auto fixed left-1/2 z-50 -translate-x-1/2',
        'bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))]',
        'border-0 bg-transparent p-0',
        'rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brezn-border focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brezn-bg)]',
        'active:scale-[0.98]',
      )}
    >
      <span
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full border border-brezn-text bg-transparent',
          'text-brezn-text',
        )}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className="block">
          <path
            d="M12 5v14M5 12h14"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </button>
  )
}
