import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { NotFoundPage } from './pages/NotFoundPage'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const EndpointDetailPage = lazy(() => import('./pages/EndpointDetailPage').then((module) => ({ default: module.EndpointDetailPage })))

function App() {
  return (
    <AppShell>
      <Suspense fallback={<div className="page-loader" role="status" aria-label="Loading" />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/endpoints/:endpointId" element={<EndpointDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  )
}

export default App
