import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
import { listNames } from '../lib/people'
import { useSetSeat } from '../lib/queries'
import { useToast } from './toast'
import { Button, ErrorText, inputClass, Modal } from './ui'

const PROMPTED_KEY = 'easework_seat_prompted'

/** Asks which Claude seat the developer is using. */
export function SeatDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useAuth()
  const save = useSetSeat()
  const toast = useToast()
  const [seat, setSeat] = useState(me?.claudeSeat ?? '')

  useEffect(() => {
    if (open) setSeat(me?.claudeSeat ?? '')
  }, [open, me?.claudeSeat])

  function close() {
    save.reset()
    onClose()
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    save.mutate(seat, {
      onSuccess: ({ me, sharedWith }) => {
        close()
        if (sharedWith.length > 0) {
          toast(`${me.claudeSeat} is also entered by ${listNames(sharedWith)}. Check with your manager.`, 'error')
        } else {
          toast(`Saved: you're using ${me.claudeSeat}`)
        }
      },
    })
  }

  return (
    <Modal open={open} onClose={close} title="Which Claude seat are you using?">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">
          Every developer has to enter the Claude seat they work on, so your manager can see which seats are in use.
        </p>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Seat</span>
          <input
            autoFocus
            className={inputClass}
            placeholder="e.g. claude-seat-14, or just 14"
            value={seat}
            onChange={(e) => setSeat(e.target.value)}
          />
        </label>
        <ErrorText error={save.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close}>
            {me?.claudeSeat ? 'Cancel' : 'Later'}
          </Button>
          <Button type="submit" disabled={!seat.trim() || save.isPending}>
            Save seat
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * For developers who haven't entered a seat: a banner on every page, and the
 * dialog opens by itself once per browser session.
 */
export function SeatReminder() {
  const { me } = useAuth()
  const missing = me?.role === 'DEVELOPER' && !me.claudeSeat
  const userId = me?.id
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!missing || !userId) return
    let prompted = false
    const key = `${PROMPTED_KEY}:${userId}`
    try {
      prompted = sessionStorage.getItem(key) === '1'
      sessionStorage.setItem(key, '1')
    } catch {
      // Storage unavailable: the banner still shows.
    }
    if (!prompted) setOpen(true)
  }, [missing, userId])

  if (!missing) return null
  return (
    <>
      <div role="alert" className="border-b border-amber-300 bg-amber-50">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm text-amber-900">
          <span>
            <span className="font-semibold">⚠ Claude seat missing.</span> Enter the seat you're using. It's required for
            every developer.
          </span>
          <Button onClick={() => setOpen(true)}>Enter seat</Button>
        </div>
      </div>
      <SeatDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
