import type { ReactNode } from 'react'
import { fetchFile } from '../lib/api'
import type { DocLinkRef } from '../lib/types'
import { useToast } from './toast'

// Types a browser shows safely in a tab. Anything else (HTML, SVG, Office files…)
// is saved as a download, so an uploaded page can never run on this site.
const PREVIEWABLE = /^(application\/pdf|image\/(png|jpeg|gif|webp)|text\/plain)$/

async function openFile(link: DocLinkRef) {
  const type = link.mimeType ?? ''
  const preview = PREVIEWABLE.test(type)
  // Open the tab during the click; once we've awaited the download, popup blockers step in.
  const tab = preview ? window.open('', '_blank') : null
  try {
    const blob = await fetchFile(link.id)
    const url = URL.createObjectURL(preview ? new Blob([blob], { type }) : blob)
    if (tab) {
      tab.location.href = url
    } else {
      const a = document.createElement('a')
      a.href = url
      a.download = link.fileName ?? link.label
      a.click()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    tab?.close()
    throw err
  }
}

/** A task document: web links open directly, uploaded files are fetched with the user's sign-in. */
export function DocLink({ link, className, children }: { link: DocLinkRef; className?: string; children: ReactNode }) {
  const toast = useToast()
  if (link.url) {
    return (
      <a href={link.url} target="_blank" rel="noreferrer noopener" className={className}>
        {children}
      </a>
    )
  }
  return (
    <button
      type="button"
      className={`text-left ${className ?? ''}`}
      title={`Open ${link.fileName ?? link.label}`}
      onClick={() => openFile(link).catch((err) => toast((err as Error).message, 'error'))}
    >
      {children}
    </button>
  )
}
