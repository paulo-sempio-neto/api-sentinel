import { FormEvent, useState } from 'react'
import { ApiError } from '../api/client'
import { createEndpoint } from '../api/endpoints'

interface AddEndpointFormProps {
  onCreated: () => void
}

function submitErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      return 'Unable to reach the API Sentinel backend. Please try again.'
    }

    if (error.status === 409) {
      return error.message || 'This URL is already registered.'
    }

    if (error.status === 422) {
      return error.message || 'Enter a valid API name and HTTP/HTTPS URL.'
    }

    return error.message
  }

  return 'An unexpected error occurred while adding the endpoint.'
}

export function AddEndpointForm({ onCreated }: AddEndpointFormProps) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    const trimmedName = name.trim()
    const trimmedUrl = url.trim()

    if (!trimmedName || !trimmedUrl) {
      setError('Enter a valid API name and HTTP/HTTPS URL.')
      return
    }

    setIsSubmitting(true)

    try {
      const endpoint = await createEndpoint({ name: trimmedName, url: trimmedUrl })
      setName('')
      setUrl('')
      setSuccess(`${endpoint.name} was added. Refreshing the dashboard data...`)
      onCreated()
    } catch (caughtError) {
      setError(submitErrorMessage(caughtError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="add-endpoint-panel" aria-labelledby="add-endpoint-title">
      <div className="section-heading">
        <div className="section-heading-copy">
          <p className="eyebrow">New monitor</p>
          <h2 id="add-endpoint-title">Add endpoint</h2>
          <p>Register an API endpoint and API Sentinel will include it in the next monitoring cycle.</p>
        </div>
      </div>

      <form className="add-endpoint-form" onSubmit={handleSubmit}>
        <label>
          <span>API name</span>
          <input
            autoComplete="off"
            disabled={isSubmitting}
            name="name"
            onChange={(event) => setName(event.target.value)}
            placeholder="Primary API"
            required
            type="text"
            value={name}
          />
        </label>
        <label>
          <span>API URL</span>
          <input
            autoComplete="url"
            disabled={isSubmitting}
            name="url"
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/health"
            required
            type="url"
            value={url}
          />
        </label>
        <button
          aria-busy={isSubmitting}
          className="button button-primary"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? <span className="button-spinner" aria-hidden="true" /> : null}
          {isSubmitting ? 'Adding...' : 'Add endpoint'}
        </button>
      </form>

      {error ? <p className="form-message form-message-error" role="alert">{error}</p> : null}
      {success ? <p className="form-message form-message-success" role="status">{success}</p> : null}
    </section>
  )
}
