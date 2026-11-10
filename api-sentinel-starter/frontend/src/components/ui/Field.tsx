import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: ReactNode
  error?: string | null
  mono?: boolean
}

export function Field({ label, hint, error, mono, className, ...props }: FieldProps) {
  const id = useId()
  const messageId = `${id}-message`
  return (
    <div className={`field ${error ? 'field--invalid' : ''} ${className ?? ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`field__input ${mono ? 'code' : ''}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? messageId : undefined}
        {...props}
      />
      {error ? (
        <p id={messageId} className="field__message field__message--error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="field__message">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
