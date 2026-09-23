import { Link } from 'react-router-dom'
import type { EndpointSummary } from '../api/types'
import { formatDateTime, formatLatency, formatStatusCode } from '../utils/formatters'
import { StatusBadge } from './StatusBadge'

interface EndpointCardProps {
  summary: EndpointSummary
  index: number
  isChecking: boolean
  isDeleting: boolean
  onDelete: (endpointId: number) => void
  onRunCheck: (endpointId: number) => void
}

export function EndpointCard({
  summary,
  index,
  isChecking,
  isDeleting,
  onDelete,
  onRunCheck,
}: EndpointCardProps) {
  const { endpoint, history, latestCheck, status } = summary
  const recentChecks = history.slice(0, 7).reverse()
  const actionInProgress = isChecking || isDeleting
  const successfulChecks = history.filter((check) => check.success).length
  const failedChecks = history.length - successfulChecks
  const recordedResponseTimes = history
    .map((check) => check.response_time_ms)
    .filter((value): value is number => value !== null)
  const averageResponseTime = recordedResponseTimes.length > 0
    ? recordedResponseTimes.reduce((total, value) => total + value, 0) / recordedResponseTimes.length
    : null
  const uptime = history.length > 0 ? (successfulChecks / history.length) * 100 : null

  return (
    <article
      aria-busy={actionInProgress}
      className={`endpoint-card endpoint-card-${status}${actionInProgress ? ' endpoint-card-busy' : ''}`}
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
          <dt>Basic uptime</dt>
          <dd>{uptime === null ? 'No data' : `${uptime.toFixed(1)}%`}</dd>
        </div>
        <div>
          <dt>Total checks</dt>
          <dd>{history.length}</dd>
        </div>
        <div>
          <dt>Average response</dt>
          <dd>{formatLatency(averageResponseTime)}</dd>
        </div>
        <div>
          <dt>Last status code</dt>
          <dd>{latestCheck ? formatStatusCode(latestCheck.status_code) : 'No checks yet'}</dd>
        </div>
        <div>
          <dt>Last checked</dt>
          <dd>{latestCheck ? formatDateTime(latestCheck.checked_at) : 'Not checked yet'}</dd>
        </div>
      </dl>
      <div className="check-history-preview">
        <div className="check-history-copy">
          <span className="check-history-label">Recent checks</span>
          <span className="check-history-summary">
            {recentChecks.length > 0
              ? `${successfulChecks} passed, ${failedChecks} failed`
              : 'Awaiting first result'}
          </span>
        </div>
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
      <div className="endpoint-card-actions">
        <button
          className="button button-primary"
          disabled={actionInProgress}
          onClick={() => onRunCheck(endpoint.id)}
          type="button"
        >
          {isChecking ? <span className="button-spinner" aria-hidden="true" /> : null}
          {isChecking ? 'Checking...' : 'Run Check'}
        </button>
        <Link className="button button-secondary" to={`/endpoints/${endpoint.id}`}>
          View details
        </Link>
        <button
          className="button button-danger"
          disabled={actionInProgress}
          onClick={() => onDelete(endpoint.id)}
          type="button"
        >
          {isDeleting ? <span className="button-spinner" aria-hidden="true" /> : null}
          {isDeleting ? 'Removing...' : 'Remove'}
        </button>
      </div>
    </article>
  )
}
