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
        'fixed left-0 right-0 top-0 z-30 bg-brezn-bg transition-[transform,opacity] duration-200 ease-out',
        showNav
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : '-translate-y-full opacity-0 pointer-events-none',
      ].join(' ')}
    >
      <div className="mx-auto flex w-full max-w-xl items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top,0px)+0.25rem)] pb-1">
        <button
          type="button"
          onClick={onOpenChat}
          aria-label="Open chat"
          className="h-9 w-9 shrink-0 rounded-lg text-black hover:opacity-80 dark:text-white grid place-items-center focus:outline-none"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
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
          className="flex-1 rounded-lg border border-black bg-brezn-panel px-2.5 py-1.5 text-base !text-black caret-black outline-none ring-0 !placeholder:text-black/50 focus:outline-none focus:ring-0 sm:text-xs dark:border-white dark:!text-white dark:caret-white dark:!placeholder:text-white/50"
        />

        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open menu"
          className="h-9 w-9 shrink-0 rounded-lg text-black hover:opacity-80 dark:text-white grid place-items-center focus:outline-none"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path fill="currentColor" d="M4 7h16v2H4V7zm0 6h16v2H4v-2zm0 6h16v2H4v-2z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
