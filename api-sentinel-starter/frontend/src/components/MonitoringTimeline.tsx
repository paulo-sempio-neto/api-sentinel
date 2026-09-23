import type { CheckResult } from '../api/types'
import { formatDateTime, formatLatency, formatStatusCode } from '../utils/formatters'
import { StatusBadge } from './StatusBadge'

interface MonitoringTimelineProps {
  checks: CheckResult[]
}

export function MonitoringTimeline({ checks }: MonitoringTimelineProps) {
  return (
    <ol className="monitoring-timeline" aria-label="Monitoring check timeline">
      {checks.map((check) => (
        <li
          key={check.id}
          className={`timeline-item ${check.success ? 'timeline-item-success' : 'timeline-item-failure'}`}
        >
          <span className="timeline-marker" aria-hidden="true" />
          <article className="timeline-card">
            <div className="timeline-card-header">
              <StatusBadge status={check.success ? 'healthy' : 'unhealthy'} />
              <time dateTime={check.checked_at}>{formatDateTime(check.checked_at)}</time>
            </div>
            <dl className="timeline-details">
              <div>
                <dt>Status code</dt>
                <dd>{formatStatusCode(check.status_code)}</dd>
              </div>
              <div>
                <dt>Response time</dt>
                <dd>{formatLatency(check.response_time_ms)}</dd>
              </div>
            </dl>
            {check.error_message ? <p className="timeline-error">{check.error_message}</p> : null}
          </article>
        </li>
      ))}
    </ol>
  )
}
