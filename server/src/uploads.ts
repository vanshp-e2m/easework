import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RequestHandler } from 'express'
import multer from 'multer'
import { HttpError } from './lib/http'

// Uploaded documents live on disk, not in the database. Back this folder up
// along with the database.
export const uploadDir = process.env.UPLOAD_DIR
  ? resolve(process.env.UPLOAD_DIR)
  : fileURLToPath(new URL('../uploads', import.meta.url))
mkdirSync(uploadDir, { recursive: true })

export const maxUploadMb = Number(process.env.MAX_UPLOAD_MB) || 25

// Files that run code when opened. Everything is served as a download, but
// there's no reason for a task document to be one of these.
const BLOCKED = new Set(['.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.ps1', '.vbs', '.js', '.jar', '.sh', '.app', '.dll'])

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    // A random name: the user's file name never touches the file system.
    filename: (_req, _file, cb) => cb(null, randomUUID()),
  }),
  limits: { fileSize: maxUploadMb * 1024 * 1024, files: 1, fields: 5 },
  // Browsers send file names as UTF-8; the default (latin1) garbles "Résumé.pdf".
  defParamCharset: 'utf8',
  fileFilter: (_req, file, cb) => {
    if (BLOCKED.has(extname(file.originalname).toLowerCase())) {
      cb(new HttpError(400, 'Programs and scripts can’t be attached'))
    } else cb(null, true)
  },
}).single('file')

/** Parses a multipart upload with one file in the `file` field, with friendly errors. */
export const receiveFile: RequestHandler = (req, res, next) => {
  upload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE' ? `That file is too large. The limit is ${maxUploadMb} MB.` : 'Upload one file at a time'
      return next(new HttpError(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400, message))
    }
    next(err)
  })
}

export const storedFilePath = (storageKey: string) => join(uploadDir, storageKey)

/** Deletes a stored file; a file that's already gone is fine. */
export function removeStoredFile(storageKey: string) {
  return rm(storedFilePath(storageKey), { force: true })
}
