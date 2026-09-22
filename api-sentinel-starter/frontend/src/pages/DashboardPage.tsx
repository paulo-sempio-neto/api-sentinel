import { useEffect, useState } from 'react'
import { listEndpointChecks, listEndpoints } from '../api/endpoints'
import { ApiError } from '../api/client'
import type { EndpointSummary } from '../api/types'
import { EmptyState } from '../components/EmptyState'
import { EndpointCard } from '../components/EndpointCard'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { getEndpointStatus } from '../utils/formatters'

function readableError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }

  return 'An unexpected error occurred while loading the dashboard.'
}

export function DashboardPage() {
  const [summaries, setSummaries] = useState<EndpointSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadDashboard() {
      setError(null)
      setSummaries(null)

      try {
        const endpoints = await listEndpoints(controller.signal)
        const latestChecks = await Promise.all(
          endpoints.map(async (endpoint) => {
            const checks = await listEndpointChecks(endpoint.id, 7, controller.signal)
            const latestCheck = checks[0] ?? null

            return {
              endpoint,
              latestCheck,
              history: checks,
              status: getEndpointStatus(latestCheck),
            }
          }),
        )

        if (!controller.signal.aborted) {
          setSummaries(latestChecks)
        }
      } catch (caughtError) {
        if (!controller.signal.aborted) {
          setError(readableError(caughtError))
        }
      }
    }

    void loadDashboard()

    return () => controller.abort()
  }, [refreshKey])

  if (error) {
    return <ErrorState message={error} onRetry={() => setRefreshKey((value) => value + 1)} />
  }

  if (!summaries) {
    return <LoadingState label="Loading monitored endpoints…" />
  }

  const healthyCount = summaries.filter((summary) => summary.status === 'healthy').length
  const unhealthyCount = summaries.filter((summary) => summary.status === 'unhealthy').length
  const uncheckedCount = summaries.filter((summary) => summary.status === 'not_checked').length

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero" aria-labelledby="dashboard-title">
        <div className="dashboard-hero-copy">
          <p className="eyebrow">Monitoring overview</p>
          <h1 id="dashboard-title">Reliability, clearly in view.</h1>
          <p>Review the latest persisted result for every endpoint and move straight to the history behind it.</p>
        </div>
        <div className="dashboard-hero-actions">
          <span className="data-source"><span aria-hidden="true" />Live API data</span>
          <button className="button button-secondary" type="button" onClick={() => setRefreshKey((value) => value + 1)}>
            Refresh data
          </button>
        </div>
      </section>

      <section className="summary-grid" aria-label="Endpoint summary">
        <article className="metric-card metric-card-total">
          <span className="metric-label">Monitored endpoints</span>
          <strong>{summaries.length}</strong>
          <span className="metric-context">All configured services</span>
        </article>
        <article className="metric-card metric-card-success">
          <span className="metric-label">Operational</span>
          <strong>{healthyCount}</strong>
          <span className="metric-context">Latest check succeeded</span>
        </article>
        <article className="metric-card metric-card-failure">
          <span className="metric-label">Issues detected</span>
          <strong>{unhealthyCount}</strong>
          <span className="metric-context">Latest check needs attention</span>
        </article>
        <article className="metric-card metric-card-pending">
          <span className="metric-label">Awaiting first check</span>
          <strong>{uncheckedCount}</strong>
          <span className="metric-context">No persisted result yet</span>
        </article>
      </section>

      <section aria-labelledby="endpoints-title">
        <div className="section-heading">
          <div className="section-heading-copy">
            <h2 id="endpoints-title">Endpoints</h2>
            <p>Open an endpoint to inspect its recorded checks and latency history.</p>
          </div>
          <span className="endpoint-count">{summaries.length} total</span>
        </div>
        {summaries.length === 0 ? (
          <EmptyState
            title="No endpoints are being monitored"
            description="Create an endpoint through the existing API Sentinel interface, then return here to view its checks."
          />
        ) : (
          <div className="endpoint-list">
            {summaries.map((summary, index) => <EndpointCard key={summary.endpoint.id} summary={summary} index={index} />)}
          </div>
        )}
      </section>
    </div>
  )
}
