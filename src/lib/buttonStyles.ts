/**
 * Utility functions for consistent button styling across the app
 */

/**
 * Base button classes for standard buttons
 */
export const buttonBase = 'btn-base focus:outline-none'

/**
 * Button classes for danger/red buttons (e.g., delete, block)
 */
export const buttonDanger = 'btn-danger focus:outline-none'

/**
 * Button classes for reaction buttons
 * @param isReacted - Whether the user has already reacted
 * @param canReact - Whether the user can react
 */
export function reactionButtonClasses(isReacted: boolean, canReact: boolean): string {
  const base = 'flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none'
  if (isReacted || !canReact) {
    return `${base} btn-base disabled`
  }
  return `${base} btn-base`
}
