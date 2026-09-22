import { Link } from 'react-router-dom'
import type { EndpointSummary } from '../api/types'
import { formatDateTime, formatLatency, formatStatusCode } from '../utils/formatters'
import { StatusBadge } from './StatusBadge'

interface EndpointCardProps {
  summary: EndpointSummary
}

export function EndpointCard({ summary }: EndpointCardProps) {
  const { endpoint, latestCheck, status } = summary

  return (
    <article className="endpoint-card">
      <div className="endpoint-card-heading">
        <div>
          <h2><Link to={`/endpoints/${endpoint.id}`}>{endpoint.name}</Link></h2>
          <p className="endpoint-url">{endpoint.url}</p>
        </div>
        <StatusBadge status={status} />
      </div>
      <dl className="endpoint-stats">
        <div>
          <dt>Latest latency</dt>
          <dd>{formatLatency(latestCheck?.response_time_ms ?? null)}</dd>
        </div>
        <div>
          <dt>Response</dt>
          <dd>{latestCheck ? formatStatusCode(latestCheck.status_code) : 'No checks yet'}</dd>
        </div>
        <div>
          <dt>Checked</dt>
          <dd>{latestCheck ? formatDateTime(latestCheck.checked_at) : '—'}</dd>
        </div>
      </dl>
      {latestCheck?.error_message ? <p className="check-error">{latestCheck.error_message}</p> : null}
      <Link className="text-link" to={`/endpoints/${endpoint.id}`}>
        View endpoint details <span aria-hidden="true">→</span>
      </Link>
    </article>
  )
}
