import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { listEndpointChecks, listEndpoints } from '../api/endpoints'
import type { CheckResult, EndpointSummary } from '../api/types'
import { getEndpointStatus } from '../utils/formatters'

export const HISTORY_LIMIT = 100
const POLL_MS = 30_000

async function loadSummaries(signal?: AbortSignal): Promise<EndpointSummary[]> {
  const endpoints = await listEndpoints(signal)
  return Promise.all(
    endpoints.map(async (endpoint) => {
      const history = await listEndpointChecks(endpoint.id, HISTORY_LIMIT, signal)
      const latestCheck = history[0] ?? null
      return { endpoint, latestCheck, history, status: getEndpointStatus(latestCheck) }
    }),
  )
}

/**
 * Loads every endpoint with its recent history and keeps it fresh: the backend
 * runs checks on its own schedule, so the dashboard re-reads quietly every 30 s
 * while the tab is visible and no action is in flight.
 */
export function useFleet() {
  const [summaries, setSummaries] = useState<EndpointSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)
  const paused = useRef(false)

  const reload = useCallback(async (signal?: AbortSignal) => {
    setSyncing(true)
    try {
      const next = await loadSummaries(signal)
      if (signal?.aborted) return
      setSummaries(next)
      setUpdatedAt(Date.now())
      setError(null)
    } catch (caught) {
      if (signal?.aborted) return
      setError(caught instanceof ApiError ? caught.message : 'An unexpected error occurred while loading the dashboard.')
    } finally {
      if (!signal?.aborted) setSyncing(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void reload(controller.signal)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !paused.current) void reload()
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !paused.current) void reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      controller.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [reload])

  /** Merge a fresh check into local state without waiting for a reload. */
  const applyCheck = useCallback((endpointId: number, check: CheckResult) => {
    setSummaries((current) =>
      current?.map((summary) => {
        if (summary.endpoint.id !== endpointId) return summary
        const history = [check, ...summary.history.filter((item) => item.id !== check.id)].slice(0, HISTORY_LIMIT)
        return { ...summary, history, latestCheck: check, status: getEndpointStatus(check) }
      }) ?? current,
    )
  }, [])

  const removeLocal = useCallback((endpointId: number) => {
    setSummaries((current) => current?.filter((summary) => summary.endpoint.id !== endpointId) ?? current)
  }, [])

  const setPaused = useCallback((value: boolean) => {
    paused.current = value
  }, [])

  return { summaries, error, updatedAt, syncing, reload, applyCheck, removeLocal, setPaused }
}

/** Re-renders on an interval so relative times ("2 minutes ago") stay honest. */
export function useNow(intervalMs = 10_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}
