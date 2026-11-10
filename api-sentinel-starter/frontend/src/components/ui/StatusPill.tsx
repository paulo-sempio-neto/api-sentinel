import type { EndpointStatus } from '../../api/types'

const LABELS: Record<EndpointStatus, string> = {
  healthy: 'Operational',
  unhealthy: 'Issue detected',
  not_checked: 'Not checked',
}

export function StatusPill({ status, size = 'sm' }: { status: EndpointStatus; size?: 'sm' | 'lg' }) {
  return (
    <span className={`pill pill--${status} pill--${size}`}>
      <span className="pill__dot" aria-hidden="true" />
      {LABELS[status]}
    </span>
  )
}

export function StatusDot({ status }: { status: EndpointStatus }) {
  return (
    <span className={`dot dot--${status}`} role="img" aria-label={LABELS[status]}>
      {status === 'unhealthy' ? <span className="dot__ring" aria-hidden="true" /> : null}
    </span>
  )
}
