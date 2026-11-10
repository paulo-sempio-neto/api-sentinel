import { useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { createEndpoint, updateEndpoint } from '../api/endpoints'
import type { Endpoint } from '../api/types'
import { Button } from './ui/Button'
import { Field } from './ui/Field'
import { Overlay } from './ui/Overlay'

export type DrawerState = { mode: 'create' } | { mode: 'edit'; endpoint: Endpoint } | null

interface EndpointDrawerProps {
  state: DrawerState
  onClose: () => void
  onSaved: (endpoint: Endpoint, mode: 'create' | 'edit') => void
}

function validateUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Enter the URL to monitor.'
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Use an http:// or https:// address.'
    return null
  } catch {
    return 'Enter a full URL, including https://.'
  }
}

function serverMessage(error: unknown): { field?: 'url'; message: string } {
  if (error instanceof ApiError) {
    if (error.status === 0) return { message: 'Unable to reach the API Sentinel backend. Check your connection and try again.' }
    if (error.status === 409) return { field: 'url', message: error.message || 'This URL is already being monitored.' }
    if (error.status === 422) return { field: 'url', message: error.message || 'Enter a valid name and an http:// or https:// URL.' }
    return { message: error.message }
  }
  return { message: 'The endpoint could not be saved. Try again.' }
}

export function EndpointDrawer({ state, onClose, onSaved }: EndpointDrawerProps) {
  const editing = state?.mode === 'edit' ? state.endpoint : null
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [errors, setErrors] = useState<{ name?: string; url?: string; form?: string }>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!state) return
    setName(editing?.name ?? '')
    setUrl(editing?.url ?? '')
    setErrors({})
    setSaving(false)
  }, [state, editing])

  const unchanged = editing !== null && name.trim() === editing.name && url.trim() === editing.url

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const next = { name: name.trim() ? undefined : 'Give this endpoint a name.', url: validateUrl(url) ?? undefined }
    setErrors(next)
    if (next.name || next.url) return

    setSaving(true)
    try {
      const input = { name: name.trim(), url: url.trim() }
      const saved = editing ? await updateEndpoint(editing.id, input) : await createEndpoint(input)
      onSaved(saved, editing ? 'edit' : 'create')
    } catch (caught) {
      const { field, message } = serverMessage(caught)
      setErrors(field ? { [field]: message } : { form: message })
      setSaving(false)
    }
  }

  return (
    <Overlay
      variant="drawer"
      open={state !== null}
      onClose={onClose}
      title={editing ? 'Edit endpoint' : 'Add endpoint'}
      description={
        editing
          ? 'Changing the name or URL keeps the recorded check history.'
          : 'API Sentinel checks it in the next monitoring cycle. You can also run a check right away.'
      }
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="endpoint-form" loading={saving} disabled={unchanged}>
            {editing ? 'Save changes' : 'Add endpoint'}
          </Button>
        </>
      }
    >
      <form id="endpoint-form" className="form-stack" onSubmit={handleSubmit} noValidate>
        <Field
          label="Name"
          data-autofocus
          autoComplete="off"
          placeholder="Payments API"
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
          hint="A short label your team will recognize."
        />
        <Field
          label="URL"
          type="url"
          mono
          autoComplete="url"
          inputMode="url"
          spellCheck={false}
          placeholder="https://api.example.com/health"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onBlur={() => url && setErrors((current) => ({ ...current, url: validateUrl(url) ?? undefined }))}
          error={errors.url}
          hint="A health-check route works best. Only 2xx responses count as passing; redirects are not followed."
        />
        {errors.form ? <p className="notice notice--error" role="alert">{errors.form}</p> : null}
      </form>
    </Overlay>
  )
}
