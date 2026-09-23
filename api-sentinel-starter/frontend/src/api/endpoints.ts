import { request } from './client'
import type { CheckResult, DeleteEndpointResponse, Endpoint, EndpointCreate } from './types'

export function listEndpoints(signal?: AbortSignal): Promise<Endpoint[]> {
  return request<Endpoint[]>('/endpoints', { signal })
}

export function createEndpoint(endpoint: EndpointCreate): Promise<Endpoint> {
  return request<Endpoint>('/endpoints', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(endpoint),
  })
}

export function checkEndpoint(endpointId: number): Promise<CheckResult> {
  return request<CheckResult>(`/endpoints/${endpointId}/check`, {
    method: 'POST',
  })
}

export function deleteEndpoint(endpointId: number): Promise<DeleteEndpointResponse> {
  return request<DeleteEndpointResponse>(`/endpoints/${endpointId}`, {
    method: 'DELETE',
  })
}

export function listEndpointChecks(
  endpointId: number,
  limit: number,
  signal?: AbortSignal,
): Promise<CheckResult[]> {
  return request<CheckResult[]>(`/endpoints/${endpointId}/checks?limit=${limit}`, { signal })
}
