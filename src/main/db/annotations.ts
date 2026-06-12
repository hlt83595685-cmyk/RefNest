import { getDb } from './index'
import type { Annotation } from '../../shared/types'

export function getAnnotationsByItem(itemId: number): Annotation[] {
  return getDb()
    .prepare('SELECT * FROM annotations WHERE item_id = ? ORDER BY page ASC, created_at ASC')
    .all(itemId) as Annotation[]
}

export function createAnnotation(
  itemId: number,
  page: number,
  type: 'highlight' | 'note',
  color: string,
  text: string,
  comment: string,
  rects: string
): Annotation {
  const db = getDb()
  db.prepare(`
    INSERT INTO annotations (item_id, page, type, color, text, comment, rects)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(itemId, page, type, color, text, comment, rects)
  const id = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id
  return db.prepare('SELECT * FROM annotations WHERE id = ?').get(id) as Annotation
}

export function updateAnnotationComment(id: number, comment: string): void {
  getDb()
    .prepare('UPDATE annotations SET comment = ? WHERE id = ?')
    .run(comment, id)
}

export function deleteAnnotation(id: number): void {
  getDb().prepare('DELETE FROM annotations WHERE id = ?').run(id)
}
