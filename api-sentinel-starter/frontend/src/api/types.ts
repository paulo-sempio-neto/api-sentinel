export interface Endpoint {
  id: number
  name: string
  url: string
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
  status: EndpointStatus
}
