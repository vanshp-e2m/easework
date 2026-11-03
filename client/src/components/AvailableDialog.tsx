import { useSetAvailable } from '../lib/queries'
import type { ReleaseOutcome, TaskSummary } from '../lib/types'
import { Button, ErrorText, Modal } from './ui'

const OUTCOMES: { value: ReleaseOutcome; label: string; hint: string; variant: 'success' | 'secondary' | 'danger' }[] =
  [
    { value: 'COMPLETED', label: 'Completed', hint: 'The work is done', variant: 'success' },
    { value: 'NOT_STARTED', label: 'Not finished — pause it', hint: 'Keep it on my list for later', variant: 'secondary' },
    { value: 'BLOCKED', label: 'Blocked', hint: "I can't continue right now", variant: 'danger' },
  ]

export function AvailableDialog({ task, onClose }: { task: TaskSummary | null; onClose: () => void }) {
  const setAvailable = useSetAvailable()

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
        {OUTCOMES.map((o) => (
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
