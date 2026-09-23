interface LoadingStateProps {
  label: string
}

export function LoadingState({ label }: LoadingStateProps) {
  return (
    <div className="state-panel" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <h2>Preparing dashboard data</h2>
      <p>{label}</p>
      <div className="loading-skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
