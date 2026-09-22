interface EmptyStateProps {
  title: string
  description: string
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="state-panel empty-panel">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  )
}
