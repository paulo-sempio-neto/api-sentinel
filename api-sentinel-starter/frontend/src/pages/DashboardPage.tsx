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
            const checks = await listEndpointChecks(endpoint.id, 1, controller.signal)
            const latestCheck = checks[0] ?? null

            return {
              endpoint,
              latestCheck,
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
      <section className="page-heading" aria-labelledby="dashboard-title">
        <div>
          <p className="eyebrow">Monitoring overview</p>
          <h1 id="dashboard-title">Endpoint health at a glance</h1>
          <p>Latest results are loaded from the API Sentinel monitoring API.</p>
        </div>
        <button className="button button-secondary" type="button" onClick={() => setRefreshKey((value) => value + 1)}>
          Refresh data
        </button>
      </section>

      <section className="summary-grid" aria-label="Endpoint summary">
        <article className="metric-card">
          <span className="metric-label">Monitored endpoints</span>
          <strong>{summaries.length}</strong>
        </article>
        <article className="metric-card metric-card-success">
          <span className="metric-label">Operational</span>
          <strong>{healthyCount}</strong>
        </article>
        <article className="metric-card metric-card-failure">
          <span className="metric-label">Issues detected</span>
          <strong>{unhealthyCount}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Awaiting first check</span>
          <strong>{uncheckedCount}</strong>
        </article>
      </section>

      <section aria-labelledby="endpoints-title">
        <div className="section-heading">
          <div>
            <h2 id="endpoints-title">Endpoints</h2>
            <p>Open an endpoint to inspect its recorded checks and latency history.</p>
          </div>
        </div>
        {summaries.length === 0 ? (
          <EmptyState
            title="No endpoints are being monitored"
            description="Create an endpoint through the existing API Sentinel interface, then return here to view its checks."
          />
        ) : (
          <div className="endpoint-list">
            {summaries.map((summary) => <EndpointCard key={summary.endpoint.id} summary={summary} />)}
          </div>
        )}
      </section>
    </div>
  )
}
