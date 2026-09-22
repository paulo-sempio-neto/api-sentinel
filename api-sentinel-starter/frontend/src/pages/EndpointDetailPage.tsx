import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { listEndpointChecks, listEndpoints } from '../api/endpoints'
import type { CheckResult, Endpoint } from '../api/types'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { HistoryChart } from '../components/HistoryChart'
import { LoadingState } from '../components/LoadingState'
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

export function EndpointDetailPage() {
  const { endpointId } = useParams()
  const numericEndpointId = Number(endpointId)
  const [detail, setDetail] = useState<EndpointDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

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

        if (!controller.signal.aborted) {
          setDetail({
            endpoint: endpoints.find((endpoint) => endpoint.id === numericEndpointId) ?? null,
            checks,
          })
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
    return <LoadingState label="Loading endpoint details…" />
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
          <button className="button button-secondary" type="button" onClick={() => setRefreshKey((value) => value + 1)}>
            Refresh data
          </button>
        </div>
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
