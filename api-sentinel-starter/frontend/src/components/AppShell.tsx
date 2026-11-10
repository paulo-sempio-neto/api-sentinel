import type { PropsWithChildren } from 'react'
import { Link, NavLink } from 'react-router-dom'

export function SentinelMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14.5" fill="#0b1e1b" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="#4fe3c1" strokeOpacity=".35" strokeWidth="1.2" />
      <path d="M16 16 L16 1.5 A14.5 14.5 0 0 1 29.6 11 Z" fill="#4fe3c1" fillOpacity=".35" />
      <path d="M16 16 L29.6 11" stroke="#4fe3c1" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="21.5" cy="21" r="2.2" fill="#4fe3c1" />
    </svg>
  )
}

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="topbar">
        <div className="topbar__inner">
          <Link className="brand" to="/" aria-label="API Sentinel overview">
            <SentinelMark />
            <span>API Sentinel</span>
          </Link>
          <nav aria-label="Primary">
            <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}>
              Overview
            </NavLink>
          </nav>
        </div>
      </header>
      <main id="main-content" className="page" tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}
