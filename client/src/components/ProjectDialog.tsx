import { useState, type FormEvent } from 'react'
import { useCreateProject } from '../lib/queries'
import type { Project } from '../lib/types'
import { Button, ErrorText, inputClass, Modal, Segmented } from './ui'

export function ProjectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Project) => void }) {
  const create = useCreateProject()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Project['kind']>('DELIVERY')
  const [description, setDescription] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    create.mutate(
      { name, kind, description },
      {
        onSuccess: (p) => {
          onCreated(p)
          onClose()
        },
      },
    )
  }

  return (
    <Modal open onClose={onClose} title="New project">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Name</span>
          <input
            autoFocus
            className={inputClass}
            placeholder="e.g. Globex – Shopify migration"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div>
          <span className="mb-1 block text-sm font-medium">Kind</span>
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: 'DELIVERY', label: 'Client / delivery' },
              { value: 'RESEARCH', label: 'Research' },
            ]}
          />
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Description (optional)</span>
          <textarea rows={2} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <ErrorText error={create.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={name.trim().length < 2 || create.isPending}>
            Create project
          </Button>
        </div>
      </form>
    </Modal>
  )
}
