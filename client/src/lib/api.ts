const TOKEN_KEY = 'easework_token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage unavailable (private mode); the session just won't survive a reload.
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function failure(res: Response, token: string | null) {
  const data = await res.json().catch(() => null)
  if (res.status === 401 && token) {
    setToken(null)
    window.location.assign('/login')
  }
  return new ApiError(res.status, data?.error ?? `Request failed (${res.status})`)
}

/** JSON in and out; a FormData body is sent as a multipart upload instead. */
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken()
  const form = options.body instanceof FormData
  const res = await fetch(`/api${path}`, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers: {
      // The browser sets the multipart Content-Type itself, boundary included.
      ...(form ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form ? (options.body as FormData) : options.body ? JSON.stringify(options.body) : undefined,
  })
  if (!res.ok) throw await failure(res, token)
  return (await res.json().catch(() => null)) as T
}

/** An uploaded file. Downloads need the auth header, which a plain link can't send. */
export async function fetchFile(linkId: string): Promise<Blob> {
  const token = getToken()
  const res = await fetch(`/api/links/${linkId}/file`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw await failure(res, token)
  return res.blob()
}
