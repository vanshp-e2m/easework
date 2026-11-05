import { useAuth } from '../auth'
import { useTeam } from '../lib/queries'
import { inputClass } from './ui'

/**
 * '' = everything visible, 'none' = unassigned, otherwise a user id. Developers
 * only see their own and unassigned tasks, so they only get those choices.
 */
export function AssigneeFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { me } = useAuth()
  const { data: team } = useTeam()
  const isManager = me?.role === 'MANAGER'
  return (
    <select
      aria-label="Filter by person"
      className={`${inputClass} sm:w-44`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{isManager ? 'Everyone' : 'Mine & unassigned'}</option>
      {!isManager && me && <option value={me.id}>Only mine</option>}
      <option value="none">Unassigned</option>
      {isManager &&
        team?.members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
    </select>
  )
}
