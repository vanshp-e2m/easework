import { useAuth } from '../auth'
import { listNames } from '../lib/people'
import { useSetAvailable } from '../lib/queries'
import type { ReleaseOutcome, TaskSummary } from '../lib/types'
import { Button, ErrorText, Modal } from './ui'

type Outcome = { value: ReleaseOutcome; label: string; hint: string; variant: 'success' | 'secondary' | 'danger' }

/** On a shared task, Completed and Blocked end it for everyone; pausing only takes you off it. */
function outcomes(others: string[]): Outcome[] {
  if (others.length === 0) {
    return [
      { value: 'COMPLETED', label: 'Completed', hint: 'The work is done', variant: 'success' },
      { value: 'NOT_STARTED', label: 'Not finished — pause it', hint: 'Keep it on my list for later', variant: 'secondary' },
      { value: 'BLOCKED', label: 'Blocked', hint: "I can't continue right now", variant: 'danger' },
    ]
  }
  const names = listNames(others)
  return [
    { value: 'COMPLETED', label: 'Completed', hint: `Done, and frees ${names} too`, variant: 'success' },
    {
      value: 'NOT_STARTED',
      label: 'Stop for now',
      hint: `${names} ${others.length === 1 ? 'keeps' : 'keep'} working on it`,
      variant: 'secondary',
    },
    { value: 'BLOCKED', label: 'Blocked', hint: `Stops ${names} too`, variant: 'danger' },
  ]
}

export function AvailableDialog({ task, onClose }: { task: TaskSummary | null; onClose: () => void }) {
  const { me } = useAuth()
  const setAvailable = useSetAvailable()
  const others = (task?.currentFor ?? []).filter((p) => p.id !== me?.id).map((p) => p.name)

  function close() {
    setAvailable.reset()
    onClose()
  }

  return (
    <Modal open={!!task} onClose={close} title="Mark yourself Available">
      <p className="mb-4 text-sm text-slate-600">
        What happened to <span className="font-medium text-slate-900">“{task?.title}”</span>?
      </p>
      <div className="space-y-2">
        {outcomes(others).map((o) => (
          <Button
            key={o.value}
            variant={o.variant}
            className="w-full justify-between"
            disabled={setAvailable.isPending}
            onClick={() => setAvailable.mutate(o.value, { onSuccess: close })}
          >
            <span>{o.label}</span>
            <span className="text-xs opacity-75">{o.hint}</span>
          </Button>
        ))}
      </div>
      <ErrorText error={setAvailable.error} />
    </Modal>
  )
}
