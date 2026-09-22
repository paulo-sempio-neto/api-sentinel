import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="state-panel empty-panel" aria-labelledby="not-found-title">
      <h1 id="not-found-title">Page not found</h1>
      <p>The page you requested is not part of the API Sentinel dashboard.</p>
      <Link className="button button-secondary" to="/">Return to dashboard</Link>
    </section>
  )
}
