const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const API_BASE_URL = (configuredBaseUrl || '/api/v1').replace(/\/+$/, '')

interface ProblemDetail {
  detail?: unknown
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

async function errorMessage(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json()
    if (isProblemDetail(payload) && typeof payload.detail === 'string') {
      return payload.detail
    }
  } catch {
    // The API may return a non-JSON error response through an intermediary.
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
