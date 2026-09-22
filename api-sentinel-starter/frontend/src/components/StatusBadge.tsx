import type { EndpointStatus } from '../api/types'

const labels: Record<EndpointStatus, string> = {
  healthy: 'Operational',
  unhealthy: 'Issue detected',
  not_checked: 'Not checked',
}

interface StatusBadgeProps {
  status: EndpointStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {labels[status]}
    </span>
  )
}
