import { buttonBase } from '../../lib/buttonStyles'

type ThemeSettingsProps = {
  theme: 'light' | 'dark'
  onThemeChange: (theme: 'light' | 'dark') => void
}

export function ThemeSettings({ theme, onThemeChange }: ThemeSettingsProps) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  const nextThemeLabel = nextTheme === 'dark' ? 'Dark' : 'Light'

  return (
    <div className="p-3">
      <div className="flex items-center gap-3">
        <div className="text-xs font-semibold text-brezn-muted">Theme</div>
        <button
          type="button"
          onClick={() => onThemeChange(nextTheme)}
          className={`rounded-xl px-3 py-2 text-xs font-semibold ${buttonBase}`}
        >
          Switch to {nextThemeLabel}
        </button>
      </div>
    </div>
  )
}
