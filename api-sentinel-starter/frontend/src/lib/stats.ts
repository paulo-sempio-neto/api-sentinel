import type { CheckResult, EndpointStatus, EndpointSummary } from '../api/types'

export type LatencyBand = 'fast' | 'ok' | 'slow' | 'none'

/** Latency thresholds shared by the radar rings, charts and labels. */
export const LATENCY_RINGS = [100, 300, 1000] as const

export function latencyBand(ms: number | null): LatencyBand {
  if (ms === null) return 'none'
  if (ms < 300) return 'fast'
  if (ms < 1000) return 'ok'
  return 'slow'
}

export interface HistoryStats {
  total: number
  passed: number
  failed: number
  uptime: number | null
  average: number | null
  p95: number | null
}

export function historyStats(checks: CheckResult[]): HistoryStats {
  const passed = checks.filter((check) => check.success).length
  const latencies = checks
    .map((check) => check.response_time_ms)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b)
  const average = latencies.length > 0 ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : null
  const p95 = latencies.length > 0 ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)] : null

  return {
    total: checks.length,
    passed,
    failed: checks.length - passed,
    uptime: checks.length > 0 ? (passed / checks.length) * 100 : null,
    average,
    p95,
  }
}

export interface FleetStats extends HistoryStats {
  endpoints: number
  healthy: number
  unhealthy: number
  unchecked: number
  lastCheckAt: string | null
}

export function fleetStats(summaries: EndpointSummary[]): FleetStats {
  const all = summaries.flatMap((summary) => summary.history)
  const count = (status: EndpointStatus) => summaries.filter((summary) => summary.status === status).length
  const lastCheckAt = all.reduce<string | null>((latest, check) => {
    if (!latest || new Date(check.checked_at).getTime() > new Date(latest).getTime()) return check.checked_at
    return latest
  }, null)

  return {
    ...historyStats(all),
    endpoints: summaries.length,
    healthy: count('healthy'),
    unhealthy: count('unhealthy'),
    unchecked: count('not_checked'),
    lastCheckAt,
  }
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function timeAgo(value: string | number, now = Date.now()): string {
  const time = typeof value === 'number' ? value : new Date(value).getTime()
  if (Number.isNaN(time)) return '—'
  const seconds = Math.round((time - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 10) return 'just now'
  if (abs < 60) return relative.format(seconds, 'second')
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour')
  return relative.format(Math.round(seconds / 86400), 'day')
}

export function formatMs(value: number | null): string {
  if (value === null) return '—'
  if (value >= 1000) return `${Number((value / 1000).toFixed(value >= 10000 ? 0 : 2))} s`
  return `${Math.round(value)} ms`
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null) return '—'
  if (value === 100) return '100%'
  return `${value.toFixed(digits)}%`
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
