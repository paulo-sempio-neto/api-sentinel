import { FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { checkEndpoint, deleteEndpoint, listEndpointChecks, listEndpoints, updateEndpoint } from '../api/endpoints'
import type { CheckResult, Endpoint } from '../api/types'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { HistoryChart } from '../components/HistoryChart'
import { LoadingState } from '../components/LoadingState'
import { MonitoringTimeline } from '../components/MonitoringTimeline'
import { StatusBadge } from '../components/StatusBadge'
import { formatDateTime, formatLatency, formatStatusCode, getEndpointStatus } from '../utils/formatters'

interface EndpointDetail {
  endpoint: Endpoint | null
  checks: CheckResult[]
}

function readableError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }

  return 'An unexpected error occurred while loading this endpoint.'
}

function readableActionError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }

  return 'The endpoint action could not be completed. Please try again.'
}

function submitErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      return 'Unable to reach the API Sentinel backend. Please try again.'
    }

    if (error.status === 409) {
      return error.message || 'This URL is already registered.'
    }

    if (error.status === 422) {
      return 'Enter a valid API name and HTTP/HTTPS URL.'
    }

    return error.message
  }

  return 'The endpoint could not be updated. Please try again.'
}

export function EndpointDetailPage() {
  const { endpointId } = useParams()
  const navigate = useNavigate()
  const numericEndpointId = Number(endpointId)
  const [detail, setDetail] = useState<EndpointDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const actionLockRef = useRef(false)

  useEffect(() => {
    const controller = new AbortController()

    async function loadEndpoint() {
      if (!Number.isInteger(numericEndpointId) || numericEndpointId < 1) {
        setError('This endpoint identifier is not valid.')
        return
      }

      setError(null)
      setDetail(null)

      try {
        const [endpoints, checks] = await Promise.all([
          listEndpoints(controller.signal),
          listEndpointChecks(numericEndpointId, 100, controller.signal),
        ])

        const endpoint = endpoints.find((currentEndpoint) => currentEndpoint.id === numericEndpointId) ?? null

        if (!controller.signal.aborted) {
          setDetail({
            endpoint,
            checks,
          })

          if (endpoint) {
            setEditName(endpoint.name)
            setEditUrl(endpoint.url)
          }
        }
      } catch (caughtError) {
        if (!controller.signal.aborted) {
          setError(readableError(caughtError))
        }
      }
    }

    void loadEndpoint()

    return () => controller.abort()
  }, [numericEndpointId, refreshKey])

  if (error) {
    return <ErrorState message={error} onRetry={() => setRefreshKey((value) => value + 1)} />
  }

  if (!detail) {
    return <LoadingState label="Loading endpoint details and monitoring history..." title="Preparing endpoint history" />
  }

  if (!detail.endpoint) {
    return (
      <EmptyState
        title="Endpoint not found"
        description="The requested endpoint is not currently registered in API Sentinel."
      />
    )
  }

  const latestCheck = detail.checks[0] ?? null
  const status = getEndpointStatus(latestCheck)
  const successfulChecks = detail.checks.filter((check) => check.success).length
  const failedChecks = detail.checks.length - successfulChecks
  const availability = detail.checks.length > 0
    ? `${((successfulChecks / detail.checks.length) * 100).toFixed(1)}%`
    : '—'
  const recentChecks = detail.checks.slice(0, 7).reverse()
  const recentSuccesses = recentChecks.filter((check) => check.success).length
  const recentFailures = recentChecks.length - recentSuccesses
  const actionInProgress = isRefreshing || isUpdating || isDeleting

  async function handleRefresh() {
    if (actionLockRef.current) {
      return
    }

    actionLockRef.current = true
    setActionError(null)
    setActionSuccess(null)
    setIsRefreshing(true)

    try {
      const check = await checkEndpoint(numericEndpointId)
      setDetail((currentDetail) => {
        if (!currentDetail) {
          return currentDetail
        }

        return {
          ...currentDetail,
          checks: [
            check,
            ...currentDetail.checks.filter((historyItem) => historyItem.id !== check.id),
          ].slice(0, 100),
        }
      })
    } catch (caughtError) {
      setActionError(readableActionError(caughtError))
    } finally {
      actionLockRef.current = false
      setIsRefreshing(false)
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (actionLockRef.current) {
      return
    }

    const trimmedName = editName.trim()
    const trimmedUrl = editUrl.trim()

    setActionError(null)
    setActionSuccess(null)

    if (!trimmedName || !trimmedUrl) {
      setActionError('Enter a valid API name and HTTP/HTTPS URL.')
      return
    }

    actionLockRef.current = true
    setIsUpdating(true)

    try {
      const endpoint = await updateEndpoint(numericEndpointId, {
        name: trimmedName,
        url: trimmedUrl,
      })

      setDetail((currentDetail) => (
        currentDetail ? { ...currentDetail, endpoint } : currentDetail
      ))
      setEditName(endpoint.name)
      setEditUrl(endpoint.url)
      setActionSuccess(`${endpoint.name} was updated.`)
    } catch (caughtError) {
      setActionError(submitErrorMessage(caughtError))
    } finally {
      actionLockRef.current = false
      setIsUpdating(false)
    }
  }

  async function handleDelete() {
    if (actionLockRef.current) {
      return
    }

    const endpointLabel = detail?.endpoint?.name ?? 'this endpoint'

    if (!window.confirm(`Remove ${endpointLabel} from API Sentinel?`)) {
      return
    }

    actionLockRef.current = true
    setActionError(null)
    setActionSuccess(null)
    setIsDeleting(true)

    try {
      await deleteEndpoint(numericEndpointId)
      navigate('/')
    } catch (caughtError) {
      setActionError(readableActionError(caughtError))
    } finally {
      actionLockRef.current = false
      setIsDeleting(false)
    }
  }

  return (
    <div className="endpoint-detail-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Dashboard</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{detail.endpoint.name}</span>
      </nav>

      <section className="detail-hero" aria-labelledby="endpoint-title">
        <div>
          <p className="eyebrow">Endpoint details</p>
          <h1 id="endpoint-title">{detail.endpoint.name}</h1>
          <a className="endpoint-url endpoint-url-link" href={detail.endpoint.url} target="_blank" rel="noreferrer">
            {detail.endpoint.url} <span aria-hidden="true">↗</span>
          </a>
        </div>
        <div className="detail-status">
          <StatusBadge status={status} />
          <button
            aria-busy={isRefreshing}
            className="button button-secondary"
            disabled={actionInProgress}
            type="button"
            onClick={handleRefresh}
          >
            {isRefreshing ? <span className="button-spinner" aria-hidden="true" /> : null}
            {isRefreshing ? 'Refreshing...' : 'Refresh data'}
          </button>
          <button
            aria-busy={isDeleting}
            className="button button-danger"
            disabled={actionInProgress}
            type="button"
            onClick={handleDelete}
          >
            {isDeleting ? <span className="button-spinner" aria-hidden="true" /> : null}
            {isDeleting ? 'Removing...' : 'Remove'}
          </button>
        </div>
      </section>

      {actionError ? <p className="form-message form-message-error" role="alert">{actionError}</p> : null}
      {actionSuccess ? <p className="form-message form-message-success" role="status">{actionSuccess}</p> : null}

      <section className="add-endpoint-panel" aria-labelledby="edit-endpoint-title">
        <div className="section-heading">
          <div className="section-heading-copy">
            <p className="eyebrow">Endpoint settings</p>
            <h2 id="edit-endpoint-title">Edit endpoint</h2>
            <p>Update the monitored name or URL without clearing the recorded check history.</p>
          </div>
        </div>

        <form className="add-endpoint-form" onSubmit={handleUpdate}>
          <label>
            <span>API name</span>
            <input
              autoComplete="off"
              disabled={actionInProgress}
              name="name"
              onChange={(event) => setEditName(event.target.value)}
              placeholder="Primary API"
              required
              type="text"
              value={editName}
            />
          </label>
          <label>
            <span>API URL</span>
            <input
              autoComplete="url"
              disabled={actionInProgress}
              name="url"
              onChange={(event) => setEditUrl(event.target.value)}
              placeholder="https://example.com/health"
              required
              type="url"
              value={editUrl}
            />
          </label>
          <button
            aria-busy={isUpdating}
            className="button button-primary"
            disabled={actionInProgress}
            type="submit"
          >
            {isUpdating ? <span className="button-spinner" aria-hidden="true" /> : null}
            {isUpdating ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      </section>

      <section className="endpoint-info-grid" aria-label="Endpoint information">
        <article>
          <span className="metric-label">Endpoint URL</span>
          <a className="endpoint-url endpoint-url-link" href={detail.endpoint.url} target="_blank" rel="noreferrer">
            {detail.endpoint.url}
          </a>
        </article>
        <article>
          <span className="metric-label">Recorded checks</span>
          <strong>{detail.checks.length}</strong>
          <span className="endpoint-info-context">{successfulChecks} successful, {failedChecks} failed</span>
        </article>
        <article>
          <span className="metric-label">Current state</span>
          <StatusBadge status={status} />
        </article>
      </section>

      <section className="detail-metrics" aria-label="Latest endpoint result">
        <article className="metric-card">
          <span className="metric-label">Latest latency</span>
          <strong>{formatLatency(latestCheck?.response_time_ms ?? null)}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Latest response</span>
          <strong>{latestCheck ? formatStatusCode(latestCheck.status_code) : '—'}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Last checked</span>
          <strong className="metric-date">{latestCheck ? formatDateTime(latestCheck.checked_at) : '—'}</strong>
        </article>
      </section>

      {latestCheck?.error_message ? <p className="check-error detail-error">Latest check: {latestCheck.error_message}</p> : null}

      <section className="availability-panel" aria-labelledby="availability-title">
        <div className="availability-heading">
          <div>
            <p className="eyebrow">Availability</p>
            <h2 id="availability-title">Reliable at a glance</h2>
            <p>Calculated from the monitoring history currently available for this endpoint.</p>
          </div>
          <div className="availability-score">
            <span>Success rate</span>
            <strong>{availability}</strong>
            <span>{detail.checks.length > 0 ? `${successfulChecks} successful of ${detail.checks.length} checks` : 'No checks recorded yet'}</span>
          </div>
        </div>
        <div className="availability-recent" aria-label="Recent check summary">
          <div className="availability-recent-copy">
            <span className="metric-label">Last {recentChecks.length || 0} checks</span>
            <strong>{recentChecks.length > 0 ? `${recentSuccesses} successful, ${recentFailures} failed` : 'Awaiting first check'}</strong>
          </div>
          {recentChecks.length > 0 ? (
            <div className="availability-bars" aria-label={`${recentChecks.length} recent checks, oldest first`}>
              {recentChecks.map((check) => (
                <span
                  key={check.id}
                  className={check.success ? 'availability-bar availability-bar-success' : 'availability-bar availability-bar-failure'}
                  title={`${formatDateTime(check.checked_at)}: ${check.success ? 'successful' : 'failed'}`}
                />
              ))}
            </div>
          ) : <span className="availability-empty">Run a check to start building availability data.</span>}
        </div>
      </section>

      {detail.checks.length > 0 ? (
        <section className="history-section" aria-labelledby="timeline-title">
          <div className="section-heading">
            <div>
              <h2 id="timeline-title">Monitoring timeline</h2>
              <p>Each recorded check includes its outcome, HTTP response, latency, and timestamp. The newest result appears first.</p>
            </div>
            <span className="endpoint-count">{detail.checks.length} recorded</span>
          </div>
          <MonitoringTimeline checks={detail.checks} />
        </section>
      ) : null}

      <section className="history-section" aria-labelledby="latency-title">
        <div className="section-heading">
          <div>
            <h2 id="latency-title">Response-time history</h2>
            <p>Based on the {detail.checks.length} most recent recorded checks.</p>
          </div>
        </div>
        <HistoryChart checks={detail.checks} />
      </section>

      <section className="history-section" aria-labelledby="checks-title">
        <div className="section-heading">
          <div>
            <h2 id="checks-title">Check history</h2>
            <p>The newest check appears first.</p>
          </div>
        </div>
        {detail.checks.length === 0 ? (
          <EmptyState
            title="No checks have been recorded"
            description="Run a check through the existing API Sentinel interface to populate this history."
          />
        ) : (
          <div className="table-wrapper" tabIndex={0}>
            <table>
              <caption className="visually-hidden">Recorded checks for {detail.endpoint.name}</caption>
              <thead>
                <tr>
                  <th scope="col">Checked at</th>
                  <th scope="col">Result</th>
                  <th scope="col">Response</th>
                  <th scope="col">Latency</th>
                  <th scope="col">Error</th>
                </tr>
              </thead>
              <tbody>
                {detail.checks.map((check) => (
                  <tr key={check.id}>
                    <td>{formatDateTime(check.checked_at)}</td>
                    <td><StatusBadge status={check.success ? 'healthy' : 'unhealthy'} /></td>
                    <td>{formatStatusCode(check.status_code)}</td>
                    <td>{formatLatency(check.response_time_ms)}</td>
                    <td>{check.error_message ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
