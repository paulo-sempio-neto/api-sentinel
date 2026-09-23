import { useEffect, useState } from 'react'
import { checkEndpoint, deleteEndpoint, listEndpointChecks, listEndpoints } from '../api/endpoints'
import { ApiError } from '../api/client'
import type { EndpointSummary } from '../api/types'
import { AddEndpointForm } from '../components/AddEndpointForm'
import { EmptyState } from '../components/EmptyState'
import { EndpointCard } from '../components/EndpointCard'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { formatShortDateTime, getEndpointStatus } from '../utils/formatters'

const HISTORY_LIMIT = 100

function formatSuccessRate(successfulChecks: number, totalChecks: number): string {
  if (totalChecks === 0) {
    return '—'
  }

  return `${((successfulChecks / totalChecks) * 100).toFixed(1)}%`
}

function getAverageResponseTime(responseTimes: Array<number | null>): string {
  const recordedResponseTimes = responseTimes.filter((value): value is number => value !== null)

  if (recordedResponseTimes.length === 0) {
    return '—'
  }

  const average = recordedResponseTimes.reduce((total, value) => total + value, 0)
    / recordedResponseTimes.length

  return `${Math.round(average)} ms`
}

function readableError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }

  return 'An unexpected error occurred while loading the dashboard.'
}

function readableActionError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }

  return 'The action could not be completed. Please try again.'
}

export function DashboardPage() {
  const [summaries, setSummaries] = useState<EndpointSummary[] | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<{
    endpointId: number
    type: 'check' | 'delete'
  } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadDashboard() {
      setError(null)

      try {
        const endpoints = await listEndpoints(controller.signal)
        const latestChecks = await Promise.all(
          endpoints.map(async (endpoint) => {
            const checks = await listEndpointChecks(endpoint.id, HISTORY_LIMIT, controller.signal)
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
          setLastUpdatedAt(new Date().toISOString())
          setActionError(null)
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

  const allChecks = summaries.flatMap((summary) => summary.history)
  const successfulChecks = allChecks.filter((check) => check.success).length
  const failedChecks = allChecks.length - successfulChecks
  const latestCheck = allChecks.reduce<typeof allChecks[number] | null>((latest, check) => {
    if (!latest || new Date(check.checked_at).getTime() > new Date(latest.checked_at).getTime()) {
      return check
    }

    return latest
  }, null)
  const successRate = formatSuccessRate(successfulChecks, allChecks.length)
  const averageResponseTime = getAverageResponseTime(allChecks.map((check) => check.response_time_ms))
  const formattedLastCheck = latestCheck ? formatShortDateTime(latestCheck.checked_at) : 'Not checked yet'

  async function handleRunCheck(endpointId: number) {
    setActionError(null)
    setPendingAction({ endpointId, type: 'check' })

    try {
      const check = await checkEndpoint(endpointId)
      setSummaries((currentSummaries) => {
        if (!currentSummaries) {
          return currentSummaries
        }

        return currentSummaries.map((summary) => {
          if (summary.endpoint.id !== endpointId) {
            return summary
          }

          const history = [
            check,
            ...summary.history.filter((historyItem) => historyItem.id !== check.id),
          ].slice(0, HISTORY_LIMIT)

          return {
            ...summary,
            latestCheck: check,
            history,
            status: getEndpointStatus(check),
          }
        })
      })
      setRefreshKey((value) => value + 1)
    } catch (caughtError) {
      setActionError(readableActionError(caughtError))
    } finally {
      setPendingAction(null)
    }
  }

  async function handleDelete(endpointId: number) {
    if (!summaries) {
      return
    }

    const endpoint = summaries.find((summary) => summary.endpoint.id === endpointId)?.endpoint
    const endpointLabel = endpoint?.name ?? 'this endpoint'

    if (!window.confirm(`Remove ${endpointLabel} from API Sentinel?`)) {
      return
    }

    setActionError(null)
    setPendingAction({ endpointId, type: 'delete' })

    try {
      await deleteEndpoint(endpointId)
      setSummaries((currentSummaries) => (
        currentSummaries?.filter((summary) => summary.endpoint.id !== endpointId) ?? currentSummaries
      ))
      setRefreshKey((value) => value + 1)
    } catch (caughtError) {
      setActionError(readableActionError(caughtError))
    } finally {
      setPendingAction(null)
    }
  }

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

      <section className="summary-grid dashboard-metrics" aria-label="Monitoring metrics">
        <article className="metric-card metric-card-total">
          <span className="metric-label">Monitored endpoints</span>
          <strong>{summaries.length}</strong>
          <span className="metric-context">All configured services</span>
        </article>
        <article className="metric-card metric-card-success">
          <span className="metric-label">Checks recorded</span>
          <strong>{allChecks.length}</strong>
          <span className="metric-context">Up to {HISTORY_LIMIT} per endpoint</span>
        </article>
        <article className="metric-card metric-card-success">
          <span className="metric-label">Success rate</span>
          <strong>{successRate}</strong>
          <span className="metric-context">{successfulChecks} successful checks</span>
        </article>
        <article className="metric-card metric-card-failure">
          <span className="metric-label">Failures</span>
          <strong>{failedChecks}</strong>
          <span className="metric-context">Checks needing attention</span>
        </article>
        <article className="metric-card metric-card-latency">
          <span className="metric-label">Average response</span>
          <strong>{averageResponseTime}</strong>
          <span className="metric-context">Across checks with latency</span>
        </article>
        <article className="metric-card metric-card-updated">
          <span className="metric-label">Last check</span>
          <strong className="metric-date">{formattedLastCheck}</strong>
          <span className="metric-context">Dashboard updated {lastUpdatedAt ? formatShortDateTime(lastUpdatedAt) : 'just now'}</span>
        </article>
      </section>

      <AddEndpointForm onCreated={() => setRefreshKey((value) => value + 1)} />

      <section aria-labelledby="endpoints-title">
        <div className="section-heading">
          <div className="section-heading-copy">
            <h2 id="endpoints-title">Endpoints</h2>
            <p>Run checks, inspect responses, or remove endpoints you no longer monitor.</p>
          </div>
          <span className="endpoint-count">{summaries.length} total</span>
        </div>
        {actionError ? <p className="form-message form-message-error" role="alert">{actionError}</p> : null}
        {summaries.length === 0 ? (
          <EmptyState
            title="No endpoints are being monitored"
            description="Use the form above to register an API URL. Once added, it will appear here with its latest status, response code, latency, and check time."
          />
        ) : (
          <div className="endpoint-list">
            {summaries.map((summary, index) => (
              <EndpointCard
                key={summary.endpoint.id}
                index={index}
                isChecking={
                  pendingAction?.endpointId === summary.endpoint.id
                  && pendingAction.type === 'check'
                }
                isDeleting={
                  pendingAction?.endpointId === summary.endpoint.id
                  && pendingAction.type === 'delete'
                }
                onDelete={handleDelete}
                onRunCheck={handleRunCheck}
                summary={summary}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
