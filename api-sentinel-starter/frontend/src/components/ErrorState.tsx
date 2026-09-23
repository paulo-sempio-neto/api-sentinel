interface ErrorStateProps {
  message: string
  onRetry: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="state-panel error-panel" role="alert">
      <h2>Unable to load monitoring data</h2>
      <p>{message}</p>
      <p className="state-panel-detail">Check the backend connection and try again.</p>
      <button className="button button-secondary" type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}
