interface ComposeButtonProps {
  onClick: () => void
}

export function ComposeButton({ onClick }: ComposeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Create new post"
      className={[
        'fixed z-50',
        // Fallback for browsers that don't support env(safe-area-inset-*)
        'bottom-6 left-1/2 -translate-x-1/2',
        // Prefer safe-area positioning when supported
        'bottom-[calc(env(safe-area-inset-bottom)+1.5rem)]',
        'h-13 w-13 rounded-full',
        'bg-brezn-gold text-brezn-bg shadow-soft',
        'grid place-items-center',
        'hover:opacity-95 active:scale-[0.98]',
        'pointer-events-auto',
        // subtle ring around the button
        "before:content-[''] before:absolute before:inset-0 before:rounded-full before:border before:border-brezn-gold/40 before:pointer-events-none",
      ].join(' ')}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="block">
        <path
          d="M12 5v14M5 12h14"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </button>
  )
}
