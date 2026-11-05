import { useAuth } from '../auth'
import type { TaskCard } from '../lib/types'
import { Button } from './ui'

/**
 * Available developers usually want to start right away; Occupied ones pick up for
 * later so their current task isn't paused by accident. `join` is the same choice
 * for a task someone else already owns: work on it with them.
 */
export function PickUpButtons({
  task,
  join = false,
  disabled,
  onPick,
}: {
  task: TaskCard
  join?: boolean
  disabled?: boolean
  onPick: (start: boolean) => void
}) {
  const { me } = useAuth()
  // Away counts as free here: picking up and starting is how someone checks back in.
  const available = me?.availability !== 'OCCUPIED'
  const verb = join ? 'Join' : 'Pick up'
  return (
    <>
      <Button variant={available ? 'secondary' : 'primary'} disabled={disabled} onClick={() => onPick(false)}>
        {available ? `${verb} for later` : verb}
      </Button>
      {available && (
        <Button disabled={disabled} onClick={() => onPick(true)} aria-label={`${verb} and start ${task.title}`}>
          {verb} &amp; start
        </Button>
      )}
    </>
  )
}
