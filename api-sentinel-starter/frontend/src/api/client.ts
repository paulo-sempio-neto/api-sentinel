const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const API_BASE_URL = (configuredBaseUrl || '/api/v1').replace(/\/+$/, '')

interface ProblemDetail {
  detail?: unknown
}

interface ValidationIssue {
  msg?: unknown
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function isProblemDetail(value: unknown): value is ProblemDetail {
  return typeof value === 'object' && value !== null && 'detail' in value
}

function isValidationIssue(value: unknown): value is ValidationIssue {
  return typeof value === 'object' && value !== null && 'msg' in value
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json()
    if (isProblemDetail(payload) && typeof payload.detail === 'string') {
      return payload.detail
    }

    if (
      isProblemDetail(payload)
      && Array.isArray(payload.detail)
      && isValidationIssue(payload.detail[0])
      && typeof payload.detail[0].msg === 'string'
    ) {
      return payload.detail[0].msg
    }
  } catch {
    // The API may return a non-JSON error response through an intermediary.
  }

  if (response.status === 422) {
    return 'The request contains invalid data.'
  }

  if (response.status >= 500) {
    return 'The API Sentinel backend returned an unexpected error.'
  }

  return `Request failed with status ${response.status}.`
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...options.headers,
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new ApiError('Unable to reach the API Sentinel backend.', 0)
  }

  if (!response.ok) {
    throw new ApiError(await errorMessage(response), response.status)
  }

  return response.json() as Promise<T>
}
