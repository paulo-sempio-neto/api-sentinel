export interface Endpoint {
  id: number
  name: string
  url: string
}

export interface EndpointCreate {
  name: string
  url: string
}

export type EndpointUpdate = EndpointCreate

export interface DeleteEndpointResponse {
  message: string
}

export interface CheckResult {
  id: number
  endpoint_id: number
  checked_at: string
  success: boolean
  status_code: number | null
  response_time_ms: number | null
  error_message: string | null
}

export type EndpointStatus = 'healthy' | 'unhealthy' | 'not_checked'

export interface EndpointSummary {
  endpoint: Endpoint
  latestCheck: CheckResult | null
  history: CheckResult[]
  status: EndpointStatus
}
