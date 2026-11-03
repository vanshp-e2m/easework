import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth'
import { useLiveStatus } from '../realtime'
import { AvailabilityBadge } from './badges'

const LIVE_LABEL = {
  live: { text: 'Live', dot: 'bg-emerald-500', hint: 'Changes appear instantly' },
  connecting: { text: 'Reconnecting…', dot: 'bg-amber-500 animate-pulse', hint: 'Updates may be delayed' },
  offline: { text: 'Offline', dot: 'bg-slate-400', hint: 'Refreshing every 10 seconds' },
}

function LiveIndicator() {
  const status = useLiveStatus()
  const { text, dot, hint } = LIVE_LABEL[status]
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-500" title={hint} role="status" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {text}
    </span>
  )
}

export function Layout() {
  const { me, logout } = useAuth()
  const isDeveloper = me?.role === 'DEVELOPER'

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'}`

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link to="/" className="text-lg font-bold tracking-tight">
            Ease<span className="text-violet-600">Work</span>
          </Link>
          <nav className="flex gap-1">
            {isDeveloper && (
              <NavLink to="/" end className={navClass}>
                My Status
              </NavLink>
            )}
            <NavLink to="/board" className={navClass}>
              Board
            </NavLink>
            <NavLink to="/research" className={navClass}>
              Research
            </NavLink>
            <NavLink to="/sheet" className={navClass}>
              Sheet
            </NavLink>
            <NavLink to="/dashboard" className={navClass}>
              Team Dashboard
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <LiveIndicator />
            {isDeveloper && me && (
              <Link to="/" title="Change my status">
                <AvailabilityBadge value={me.availability} />
              </Link>
            )}
            <span className="hidden text-slate-600 sm:inline">
              {me?.name}
              {me?.role === 'MANAGER' && <span className="ml-1 text-xs text-slate-400">(Manager)</span>}
            </span>
            <button onClick={logout} className="text-slate-500 hover:text-slate-900">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
