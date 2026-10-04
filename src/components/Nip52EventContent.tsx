import {
  nip52Description,
  nip52EventUrl,
  nip52FormatSchedule,
  nip52LocationsLine,
  nip52Title,
} from '../lib/nip52'
import { isSafeUrl } from '../lib/urls'
import type { Event } from '../lib/nostrPrimitives'

function stop(e: React.SyntheticEvent) {
  e.stopPropagation()
}

export function Nip52EventContent(props: { evt: Event; interactive?: boolean }) {
  const { evt, interactive } = props
  const title = nip52Title(evt)
  const schedule = nip52FormatSchedule(evt)
  const location = nip52LocationsLine(evt)
  const description = nip52Description(evt)
  const url = nip52EventUrl(evt)
  const safeUrl = url && isSafeUrl(url) ? url : undefined

  return (
    <div className="min-w-0 max-w-full">
      {title ? <div className="font-semibold">{title}</div> : null}
      {schedule ? <div className="mt-1">{schedule}</div> : null}
      {location ? <div className="mt-1">{location}</div> : null}
      {description ? (
        <div className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {description}
        </div>
      ) : null}
      {safeUrl ? (
        <a
          href={safeUrl}
          target="_blank"
          rel="noreferrer"
          onClick={interactive ? stop : undefined}
          title={safeUrl}
          className="mt-1 block min-w-0 truncate font-medium text-brezn-link underline underline-offset-2 hover:opacity-90 focus:outline-none"
        >
          {safeUrl}
        </a>
      ) : null}
    </div>
  )
}
