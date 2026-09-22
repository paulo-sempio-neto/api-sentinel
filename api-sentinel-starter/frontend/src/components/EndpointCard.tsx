import { Link } from 'react-router-dom'
import type { EndpointSummary } from '../api/types'
import { formatDateTime, formatLatency, formatStatusCode } from '../utils/formatters'
import { StatusBadge } from './StatusBadge'

interface EndpointCardProps {
  summary: EndpointSummary
  index: number
}

export function EndpointCard({ summary, index }: EndpointCardProps) {
  const { endpoint, history, latestCheck, status } = summary
  const recentChecks = history.slice(0, 7).reverse()

  return (
    <article
      className={`endpoint-card endpoint-card-${status}`}
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <div className="endpoint-card-heading">
        <div>
          <h2><Link to={`/endpoints/${endpoint.id}`}>{endpoint.name}</Link></h2>
          <p className="endpoint-url">{endpoint.url}</p>
        </div>
        <StatusBadge status={status} />
      </div>
      <dl className="endpoint-stats">
        <div className="endpoint-stat-primary">
          <dt>Current latency</dt>
          <dd>{formatLatency(latestCheck?.response_time_ms ?? null)}</dd>
        </div>
        <div>
          <dt>Response</dt>
          <dd>{latestCheck ? formatStatusCode(latestCheck.status_code) : 'No checks yet'}</dd>
        </div>
        <div>
          <dt>Last checked</dt>
          <dd>{latestCheck ? formatDateTime(latestCheck.checked_at) : 'Not checked yet'}</dd>
        </div>
      </dl>
      <div className="check-history-preview">
        <span className="check-history-label">Recent checks</span>
        {recentChecks.length > 0 ? (
          <div className="check-history-bars" aria-label={`${recentChecks.length} most recent checks, oldest first`}>
            {recentChecks.map((check) => (
              <span
                key={check.id}
                className={check.success ? 'history-bar history-bar-success' : 'history-bar history-bar-failure'}
                title={`${formatDateTime(check.checked_at)}: ${check.success ? 'successful' : 'failed'}`}
              />
            ))}
          </div>
        ) : <span className="check-history-empty">No recorded checks</span>}
      </div>
      {latestCheck?.error_message ? <p className="check-error">{latestCheck.error_message}</p> : null}
      <Link className="text-link" to={`/endpoints/${endpoint.id}`}>
        View endpoint details <span aria-hidden="true">&rarr;</span>
      </Link>
    </article>
  )
}
