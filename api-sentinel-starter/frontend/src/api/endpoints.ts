import { request } from './client'
import type { CheckResult, Endpoint } from './types'

export function listEndpoints(signal?: AbortSignal): Promise<Endpoint[]> {
  return request<Endpoint[]>('/endpoints', { signal })
}

export function listEndpointChecks(
  endpointId: number,
  limit: number,
  signal?: AbortSignal,
): Promise<CheckResult[]> {
  return request<CheckResult[]>(`/endpoints/${endpointId}/checks?limit=${limit}`, { signal })
}
