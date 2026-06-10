import { copyFileSync, mkdirSync, statSync, unlinkSync } from 'fs'
import { join, basename, extname } from 'path'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import { getDb } from './index'

export interface Attachment {
  id: number
  item_id: number
  type: string
  filename: string | null
  path: string | null
  url: string | null
  mime_type: string | null
  size: number | null
}

function attachmentsDir(): string {
  const dir = join(app.getPath('userData'), 'attachments')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function getAttachmentsByItem(itemId: number): Attachment[] {
  return getDb()
    .prepare('SELECT * FROM attachments WHERE item_id = ? ORDER BY id')
    .all(itemId) as Attachment[]
}

export function addAttachment(itemId: number, srcPath: string): Attachment {
  const db = getDb()
  const ext = extname(srcPath).toLowerCase()
  const filename = basename(srcPath)
  const destName = `${randomUUID()}${ext}`
  const destPath = join(attachmentsDir(), destName)

  copyFileSync(srcPath, destPath)

  let size: number | null = null
  try { size = statSync(destPath).size } catch { /* ignore */ }

  const mime = ext === '.pdf' ? 'application/pdf' : null
  const type = ext === '.pdf' ? 'pdf' : 'other'

  db.prepare(`
    INSERT INTO attachments (item_id, type, filename, path, mime_type, size)
    VALUES (@item_id, @type, @filename, @path, @mime_type, @size)
  `).run({ item_id: itemId, type, filename, path: destPath, mime_type: mime, size })

  const id = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id
  return db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as Attachment
}

export function removeAttachment(id: number): void {
  const db = getDb()
  const row = db.prepare('SELECT path FROM attachments WHERE id = ?').get(id) as { path: string | null } | undefined
  if (row?.path) {
    try { unlinkSync(row.path) } catch { /* file may already be gone */ }
  }
  db.prepare('DELETE FROM attachments WHERE id = ?').run(id)
}

export function getAttachmentPath(id: number): string | null {
  const row = getDb()
    .prepare('SELECT path FROM attachments WHERE id = ?')
    .get(id) as { path: string | null } | undefined
  return row?.path ?? null
}
