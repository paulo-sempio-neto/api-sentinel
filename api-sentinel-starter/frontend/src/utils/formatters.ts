import type { CheckResult, EndpointStatus } from '../api/types'

export function getEndpointStatus(check: CheckResult | null): EndpointStatus {
  if (!check) {
    return 'not_checked'
  }

  return check.success ? 'healthy' : 'unhealthy'
}

export function formatLatency(value: number | null): string {
  if (value === null) {
    return '—'
  }

  return `${Math.round(value)} ms`
}

export function formatStatusCode(value: number | null): string {
  return value === null ? 'No response' : `HTTP ${value}`
}

export function formatDateTime(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}

export function formatShortDateTime(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}
