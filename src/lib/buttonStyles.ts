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
 * Button classes for reaction buttons (icon + counter only, no background)
 * @param isReacted - Whether the user has already reacted
 * @param canReact - Whether the user can react
 */
export function reactionButtonClasses(isReacted: boolean, canReact: boolean): string {
  const base = 'inline-flex items-center gap-1.5 py-1 pr-0.5 text-xs font-semibold focus:outline-none min-w-0'
  if (isReacted || !canReact) {
    return `${base} opacity-70 cursor-default`
  }
  return `${base} hover:opacity-80 active:opacity-90 cursor-pointer`
}
