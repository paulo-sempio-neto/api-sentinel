import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { NotFoundPage } from './pages/NotFoundPage'
import { DashboardPage } from './pages/DashboardPage'
import { EndpointDetailPage } from './pages/EndpointDetailPage'

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/endpoints/:endpointId" element={<EndpointDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  )
}

export default App
