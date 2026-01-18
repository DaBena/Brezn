interface NavigationBarProps {
  showNav: boolean
  searchQuery: string
  onSearchChange: (query: string) => void
  onOpenChat: () => void
  onOpenMenu: () => void
}

export function NavigationBar({
  showNav,
  searchQuery,
  onSearchChange,
  onOpenChat,
  onOpenMenu,
}: NavigationBarProps) {
  return (
    <div
      className={[
        'fixed z-30 mx-auto flex w-full max-w-xl items-center gap-2 px-4 transition-all duration-200',
        // Fallback for browsers that don't support env(safe-area-inset-*)
        'left-1/2 -translate-x-1/2',
        // Prefer safe-area positioning when supported
        showNav
          ? 'top-[calc(env(safe-area-inset-top)+0.25rem)] opacity-100 pointer-events-auto'
          : 'top-[-100%] opacity-0 pointer-events-none',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onOpenChat}
        aria-label="Open chat"
        className="h-9 w-9 shrink-0 rounded-lg text-brezn-muted grid place-items-center hover:text-brezn-text focus:outline-none"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="opacity-90">
          <path
            fill="currentColor"
            d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
          />
        </svg>
      </button>

      <input
        id="search-posts"
        name="search"
        type="text"
        value={searchQuery}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="Search posts…"
        className="flex-1 rounded-lg border border-brezn-border bg-brezn-panel2 px-2.5 py-1.5 text-xs outline-none placeholder:text-brezn-muted focus:ring-2 focus:ring-brezn-gold/40"
      />

      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="h-9 w-9 shrink-0 rounded-lg text-brezn-muted grid place-items-center hover:text-brezn-text focus:outline-none"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="opacity-90">
          <path fill="currentColor" d="M4 7h16v2H4V7zm0 6h16v2H4v-2zm0 6h16v2H4v-2z" />
        </svg>
      </button>
    </div>
  )
}
