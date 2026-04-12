const HEART_PATH =
  'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z'

type HeartIconProps = { liked: boolean; size?: number }

export function HeartIcon({ liked, size = 14 }: HeartIconProps) {
  return (
    <span aria-hidden="true" className={liked ? 'text-brezn-heart' : 'text-brezn-muted'}>
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill={liked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={HEART_PATH} />
      </svg>
    </span>
  )
}
