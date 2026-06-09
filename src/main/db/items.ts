import { randomUUID } from 'crypto'
import { getDb } from './index'

export interface Item {
  id: number
  key: string
  type: string
  title: string | null
  abstract: string | null
  year: number | null
  doi: string | null
  url: string | null
  library_id: number
  created_at: number
  updated_at: number
  version: number
}

export function getAllItems(libraryId = 1): Item[] {
  return getDb()
    .prepare('SELECT * FROM items WHERE library_id = ? ORDER BY updated_at DESC')
    .all(libraryId) as Item[]
}

export function getItemById(id: number): Item | undefined {
  return getDb().prepare('SELECT * FROM items WHERE id = ?').get(id) as Item | undefined
}

export function createItem(data: Partial<Item>): Item {
  const db = getDb()
  const key = randomUUID()
  const now = Math.floor(Date.now() / 1000)
  db.prepare(`
    INSERT INTO items (key, type, title, abstract, year, doi, url, library_id, created_at, updated_at)
    VALUES (@key, @type, @title, @abstract, @year, @doi, @url, @library_id, @created_at, @updated_at)
  `).run({
    key,
    type: data.type ?? 'journalArticle',
    title: data.title ?? null,
    abstract: data.abstract ?? null,
    year: data.year ?? null,
    doi: data.doi ?? null,
    url: data.url ?? null,
    library_id: data.library_id ?? 1,
    created_at: now,
    updated_at: now,
  })
  return getDb().prepare('SELECT * FROM items WHERE key = ?').get(key) as Item
}

export function updateItem(id: number, data: Partial<Item>): void {
  const now = Math.floor(Date.now() / 1000)
  getDb().prepare(`
    UPDATE items
    SET title = COALESCE(@title, title),
        abstract = COALESCE(@abstract, abstract),
        year = COALESCE(@year, year),
        doi = COALESCE(@doi, doi),
        url = COALESCE(@url, url),
        updated_at = @updated_at,
        version = version + 1
    WHERE id = @id
  `).run({ ...data, id, updated_at: now })
}

export function deleteItem(id: number): void {
  getDb().prepare('DELETE FROM items WHERE id = ?').run(id)
}

export function searchItems(query: string): Item[] {
  return getDb().prepare(`
    SELECT i.* FROM items i
    JOIN items_fts ON items_fts.rowid = i.id
    WHERE items_fts MATCH ?
    ORDER BY rank
  `).all(query) as Item[]
}
