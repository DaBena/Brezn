/**
 * List tiles on the main feed / profile author list: same fill as the page (`brezn-bg`);
 * separation is via border only.
 */
export const feedListPostCardClass =
  'rounded-lg border border-brezn-border bg-brezn-bg px-3 py-2 cursor-pointer focus:outline-none'

export const feedListPostDeletedClass =
  'rounded-lg border border-brezn-border bg-brezn-muted/20 px-3 py-2 opacity-80'

/**
 * Post blocks inside sheets (dialog uses `brezn-panel`); card matches that surface so
 * innards are not a third shade vs. the area around the rounded border.
 */
export const sheetPostCardClass = 'rounded-lg border border-brezn-border bg-brezn-panel p-3'
