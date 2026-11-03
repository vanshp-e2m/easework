// While the live connection is up, polling is only a slow safety net.
const LIVE_MS = 60_000
const FALLBACK_MS = 10_000

let live = false

export function setLive(value: boolean) {
  live = value
}

/** `refetchInterval` for shared views; re-read by React Query after every fetch. */
export const liveRefreshInterval = () => (live ? LIVE_MS : FALLBACK_MS)
