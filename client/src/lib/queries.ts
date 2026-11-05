import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from './api'
import { liveRefreshInterval } from './liveRefresh'
import type {
  Activity,
  EntryKind,
  LinkKind,
  Me,
  OccupiedInput,
  Project,
  ReleaseOutcome,
  SeatRow,
  SheetRow,
  TaskCard,
  TaskDetail,
  TaskEntry,
  TaskInput,
  TaskLink,
  TaskStatus,
  TaskSummary,
  TeamResponse,
} from './types'


// Any status or task change can affect every live view, so refresh them together.
function refreshLiveViews(qc: QueryClient) {
  for (const key of ['me', 'myTasks', 'tasks', 'task', 'sheet', 'team', 'activity']) {
    qc.invalidateQueries({ queryKey: [key] })
  }
}

export const useSheet = () =>
  useQuery({ queryKey: ['sheet'], queryFn: () => api<SheetRow[]>('/sheet'), refetchInterval: liveRefreshInterval })

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; kind: Project['kind']; description?: string }) =>
      api<Project>('/projects', { body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export const useTaskDetail = (id: string) =>
  useQuery({
    queryKey: ['task', id],
    queryFn: () => api<TaskDetail>(`/tasks/${id}/detail`),
    refetchInterval: liveRefreshInterval,
  })

/** Documentation writes only touch this task's page and the activity feed. */
function useDocMutation<TInput, TResult>(taskId: string, mutationFn: (input: TInput) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const key of [['task', taskId], ['sheet'], ['activity']]) qc.invalidateQueries({ queryKey: key })
    },
  })
}

export const useAddEntry = (taskId: string) =>
  useDocMutation(taskId, (input: { kind: EntryKind; body: string }) =>
    api<TaskEntry>(`/tasks/${taskId}/entries`, { body: input }),
  )

export const useUpdateEntry = (taskId: string) =>
  useDocMutation(taskId, ({ id, body }: { id: string; body: string }) =>
    api<TaskEntry>(`/entries/${id}`, { method: 'PATCH', body: { body } }),
  )

export const useDeleteEntry = (taskId: string) =>
  useDocMutation(taskId, (id: string) => api<null>(`/entries/${id}`, { method: 'DELETE' }))

export const useAddLink = (taskId: string) =>
  useDocMutation(taskId, (input: { label: string; url: string; kind: LinkKind }) =>
    api<TaskLink>(`/tasks/${taskId}/links`, { body: input }),
  )

export const useUploadFile = (taskId: string) =>
  useDocMutation(taskId, ({ file, label, kind }: { file: File; label: string; kind: LinkKind }) => {
    const form = new FormData()
    form.append('label', label)
    form.append('kind', kind)
    form.append('file', file)
    return api<TaskLink>(`/tasks/${taskId}/files`, { body: form })
  })

export const useDeleteLink = (taskId: string) =>
  useDocMutation(taskId, (id: string) => api<null>(`/links/${id}`, { method: 'DELETE' }))

export const useMyTasks = () => useQuery({ queryKey: ['myTasks'], queryFn: () => api<TaskSummary[]>('/me/tasks') })

export const useProjects = () =>
  useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/projects'), staleTime: 5 * 60_000 })

export const useTeam = () =>
  useQuery({ queryKey: ['team'], queryFn: () => api<TeamResponse>('/team'), refetchInterval: liveRefreshInterval })

export const useActivity = (limit = 25) =>
  useQuery({
    queryKey: ['activity', limit],
    queryFn: () => api<Activity[]>(`/activity?limit=${limit}`),
    placeholderData: (previous) => previous,
    refetchInterval: liveRefreshInterval,
  })

export const useTasks = () =>
  useQuery({ queryKey: ['tasks'], queryFn: () => api<TaskCard[]>('/tasks'), refetchInterval: liveRefreshInterval })

function useStatusMutation<TInput>(mutationFn: (input: TInput) => Promise<Me>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (me) => {
      qc.setQueryData(['me'], me)
      refreshLiveViews(qc)
    },
  })
}

export const useSetOccupied = () =>
  useStatusMutation((input: OccupiedInput) => api<Me>('/me/occupied', { body: input }))

export const useSetAway = () => useStatusMutation(() => api<Me>('/me/away', { method: 'POST', body: {} }))

export const useSetAvailable = () =>
  useStatusMutation((currentTaskOutcome?: ReleaseOutcome) =>
    api<Me>('/me/available', { method: 'POST', body: { currentTaskOutcome } }),
  )

export function useSetSeat() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (seat: string) => api<{ me: Me; sharedWith: string[] }>('/me/seat', { method: 'PUT', body: { seat } }),
    onSuccess: ({ me }) => {
      qc.setQueryData(['me'], me)
      qc.invalidateQueries({ queryKey: ['seats'] })
    },
  })
}

/** Manager only: who uses which Claude seat. */
export const useSeats = (enabled: boolean) =>
  useQuery({
    queryKey: ['seats'],
    queryFn: () => api<SeatRow[]>('/team/seats'),
    enabled,
    refetchInterval: liveRefreshInterval,
  })

export function useSaveTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: TaskInput }) =>
      id ? api<TaskCard>(`/tasks/${id}`, { method: 'PATCH', body: input }) : api<TaskCard>('/tasks', { body: input }),
    onSuccess: () => refreshLiveViews(qc),
  })
}

export function usePickUpTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, start }: { id: string; start: boolean }) =>
      api<TaskCard>(`/tasks/${id}/pickup`, { body: { start } }),
    // Refresh on failure too: losing a pick-up race means our list is stale.
    onSettled: () => refreshLiveViews(qc),
  })
}

export function useJoinTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, start }: { id: string; start: boolean }) => api<TaskCard>(`/tasks/${id}/join`, { body: { start } }),
    onSettled: () => refreshLiveViews(qc),
  })
}

/** The owner or a manager adds a collaborator. */
export function useAddMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, userId }: { taskId: string; userId: string }) =>
      api<TaskCard>(`/tasks/${taskId}/members`, { body: { userId } }),
    onSuccess: () => refreshLiveViews(qc),
  })
}

/** A collaborator leaving (their own id), or the owner or a manager taking someone off. */
export function useRemoveMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, userId }: { taskId: string; userId: string }) =>
      api<TaskCard>(`/tasks/${taskId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => refreshLiveViews(qc),
  })
}

export function useReleaseTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<TaskCard>(`/tasks/${id}/release`, { method: 'POST', body: {} }),
    onSuccess: () => refreshLiveViews(qc),
  })
}

/** Kanban move: the card jumps columns immediately and snaps back if the server refuses. */
export function useMoveTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      api<TaskCard>(`/tasks/${id}/status`, { body: { status } }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['tasks'] })
      const previous = qc.getQueryData<TaskCard[]>(['tasks'])
      qc.setQueryData<TaskCard[]>(['tasks'], (tasks) => tasks?.map((t) => (t.id === id ? { ...t, status } : t)))
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) qc.setQueryData(['tasks'], context.previous)
    },
    onSettled: () => refreshLiveViews(qc),
  })
}
