import { getDb } from './index'
import type { Note } from '../../shared/types'

export function getNotesByItem(itemId: number): Note[] {
  return getDb()
    .prepare('SELECT * FROM notes WHERE item_id = ? ORDER BY created_at ASC')
    .all(itemId) as Note[]
}

export function createNote(itemId: number, content: string): Note {
  const db = getDb()
  db.prepare(`
    INSERT INTO notes (item_id, content) VALUES (?, ?)
  `).run(itemId, content)
  const id = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
}

export function updateNote(id: number, content: string): void {
  getDb()
    .prepare('UPDATE notes SET content = ?, updated_at = unixepoch() WHERE id = ?')
    .run(content, id)
}

export function deleteNote(id: number): void {
  getDb().prepare('DELETE FROM notes WHERE id = ?').run(id)
}
