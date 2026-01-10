/**
 * Utility functions for consistent button styling across the app
 */

const BUTTON_ACTIVE = 'bg-[#4a4a52]'
const BUTTON_DISABLED = 'bg-[#2a2a30]'

/**
 * Base button classes for standard buttons
 */
export const buttonBase = `${BUTTON_ACTIVE} text-brezn-text hover:opacity-90 focus:outline-none disabled:bg-[#2a2a30] disabled:opacity-100`

/**
 * Button classes for danger/red buttons (e.g., delete, block)
 */
export const buttonDanger = `${BUTTON_ACTIVE} text-brezn-danger hover:opacity-90 focus:outline-none disabled:bg-[#2a2a30] disabled:opacity-100`

/**
 * Button classes for reaction buttons
 * @param isReacted - Whether the user has already reacted
 * @param canReact - Whether the user can react
 */
export function reactionButtonClasses(isReacted: boolean, canReact: boolean): string {
  const base = 'flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none'
  if (isReacted || !canReact) {
    return `${base} ${BUTTON_DISABLED} text-brezn-text`
  }
  return `${base} ${BUTTON_ACTIVE} text-brezn-text hover:opacity-90`
}
