interface LoadingStateProps {
  label: string
  title?: string
}

export function LoadingState({ label, title = 'Preparing monitoring data' }: LoadingStateProps) {
  return (
    <div className="state-panel" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <h2>{title}</h2>
      <p>{label}</p>
      <div className="loading-skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
