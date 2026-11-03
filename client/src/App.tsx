import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { Layout } from './components/Layout'
import { BoardPage } from './pages/BoardPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { MyStatusPage } from './pages/MyStatusPage'
import { ResearchPage } from './pages/ResearchPage'
import { SheetPage } from './pages/SheetPage'
import { TaskPage } from './pages/TaskPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { signedIn, isLoading } = useAuth()
  if (!signedIn) return <Navigate to="/login" replace />
  if (isLoading) return <p className="p-6 text-slate-500">Loading…</p>
  return children
}

// Developers land on their status page; managers have no status, so they land on the dashboard.
function Home() {
  const { me } = useAuth()
  return me?.role === 'MANAGER' ? <Navigate to="/dashboard" replace /> : <MyStatusPage />
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="/research" element={<ResearchPage />} />
        <Route path="/tasks/:id" element={<TaskPage />} />
        <Route path="/sheet" element={<SheetPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
