import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { Button, ErrorText, inputClass } from '../components/ui'

const DEMO_ACCOUNTS = [
  ['manager@ease.work', 'Manager'],
  ['aarav@ease.work', 'Developer – Available, has a WordPress task'],
  ['priya@ease.work', 'Developer – Occupied on PM support'],
  ['rohan@ease.work', 'Developer – Occupied on R&D'],
  ['sara@ease.work', 'Developer – Available, has a Blocked task'],
]

export function LoginPage() {
  const { signedIn, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  if (signedIn) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      await login(email, password)
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-bold tracking-tight">
          Ease<span className="text-violet-600">Work</span>
        </h1>
        <p className="mb-6 text-sm text-slate-500">Developer availability & task tracking</p>
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <input
            className={inputClass}
            type="email"
            placeholder="Email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className={inputClass}
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" className="w-full" disabled={pending || !email || !password}>
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
          <ErrorText error={error} />
        </form>

        <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-4 text-sm">
          <p className="mb-2 font-medium text-slate-700">Demo accounts (password: password123)</p>
          <ul className="space-y-1">
            {DEMO_ACCOUNTS.map(([addr, note]) => (
              <li key={addr}>
                <button
                  type="button"
                  className="text-left hover:underline"
                  onClick={() => {
                    setEmail(addr)
                    setPassword('password123')
                  }}
                >
                  <span className="font-mono text-slate-800">{addr}</span>
                  <span className="block text-xs text-slate-500">{note}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
