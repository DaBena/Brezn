import type { ApproxDistanceInfo } from '../lib/geo'

type Props = {
  info: ApproxDistanceInfo
}

/**
 * Clickable approximate distance with a north-up bearing arrow → geohash cell map.
 * Stops click propagation so parent feed cards still open the thread.
 */
export function DistanceLabel({ info }: Props) {
  return (
    <a
      href={info.mapUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="group ms-1 inline-flex items-center gap-0.5 text-brezn-text"
    >
      {info.bearingDeg != null ? (
        <span
          aria-hidden
          className="inline-block leading-none"
          style={{ transform: `rotate(${info.bearingDeg}deg)` }}
        >
          ↑
        </span>
      ) : null}
      <span className="underline-offset-2 group-hover:underline">{info.text}</span>
    </a>
  )
}
