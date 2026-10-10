import { useTranslation } from 'react-i18next'
import { buttonBase } from '../lib/buttonStyles'

export function FollowButton(props: {
  isFollowed: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={(e) => {
        e.stopPropagation()
        props.onClick()
      }}
      className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold ${buttonBase}`}
    >
      {props.isFollowed ? t('follow.unfollow') : t('follow.follow')}
    </button>
  )
}
