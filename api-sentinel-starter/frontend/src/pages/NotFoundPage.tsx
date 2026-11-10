import { ArrowLeft } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  useEffect(() => {
    document.title = 'Page not found · API Sentinel'
  }, [])

  return (
    <div className="empty empty--page">
      <p className="empty__code code">404</p>
      <h1>Nothing at this address</h1>
      <p>The page you followed doesn’t exist. Your monitored endpoints are on the overview.</p>
      <Link className="btn btn--secondary btn--md" to="/">
        <ArrowLeft size={16} aria-hidden="true" /> Back to overview
      </Link>
    </div>
  )
}
