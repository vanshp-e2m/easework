import { useAuth } from '../auth'
import type { TaskCard } from '../lib/types'
import { Button } from './ui'

/**
 * Available developers usually want to start right away; Occupied ones pick up for
 * later so their current task isn't paused by accident.
 */
export function PickUpButtons({
  task,
  disabled,
  onPick,
}: {
  task: TaskCard
  disabled?: boolean
  onPick: (start: boolean) => void
}) {
  const { me } = useAuth()
  const available = me?.availability === 'AVAILABLE'
  return (
    <>
      <Button variant={available ? 'secondary' : 'primary'} disabled={disabled} onClick={() => onPick(false)}>
        {available ? 'Pick up for later' : 'Pick up'}
      </Button>
      {available && (
        <Button disabled={disabled} onClick={() => onPick(true)} aria-label={`Pick up and start ${task.title}`}>
          Pick up &amp; start
        </Button>
      )}
    </>
  )
}
