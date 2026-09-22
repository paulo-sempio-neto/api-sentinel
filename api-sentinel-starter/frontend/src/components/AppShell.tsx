import type { PropsWithChildren } from 'react'
import { Link, useLocation } from 'react-router-dom'

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation()
  const isDashboard = location.pathname === '/'

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="site-header">
        <div className="container header-content">
          <Link className="brand" to="/" aria-label="API Sentinel dashboard">
            <span className="brand-mark" aria-hidden="true">◉</span>
            <span>API Sentinel</span>
          </Link>
          <nav aria-label="Primary navigation">
            <Link className={isDashboard ? 'nav-link is-active' : 'nav-link'} to="/">
              Dashboard
            </Link>
          </nav>
        </div>
      </header>
      <main id="main-content" className="container page-content">
        {children}
      </main>
    </div>
  )
}
