import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export async function initDatabase(): Promise<void> {
  const dataDir = join(app.getPath('userData'), 'data')
  mkdirSync(dataDir, { recursive: true })

  const dbPath = join(dataDir, 'refnest.db')
  db = new Database(dbPath)

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations(db)
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `)

  const current = (
    db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null }
  ).v ?? 0

  if (current < 1) {
    db.exec(`
      -- Libraries
      CREATE TABLE IF NOT EXISTS libraries (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'personal'
      );
      INSERT OR IGNORE INTO libraries (id, name, type) VALUES (1, 'My Library', 'personal');

      -- Collections
      CREATE TABLE IF NOT EXISTS collections (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        library_id  INTEGER NOT NULL REFERENCES libraries(id),
        parent_id   INTEGER REFERENCES collections(id),
        name        TEXT NOT NULL,
        key         TEXT NOT NULL UNIQUE
      );

      -- Items
      CREATE TABLE IF NOT EXISTS items (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        key         TEXT NOT NULL UNIQUE,
        type        TEXT NOT NULL,
        title       TEXT,
        abstract    TEXT,
        year        INTEGER,
        doi         TEXT,
        url         TEXT,
        library_id  INTEGER NOT NULL DEFAULT 1 REFERENCES libraries(id),
        created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
        version     INTEGER NOT NULL DEFAULT 0
      );

      -- Creators
      CREATE TABLE IF NOT EXISTS creators (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT,
        last_name  TEXT NOT NULL,
        orcid      TEXT
      );
      CREATE TABLE IF NOT EXISTS item_creators (
        item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        creator_id INTEGER NOT NULL REFERENCES creators(id),
        role       TEXT NOT NULL DEFAULT 'author',
        position   INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (item_id, creator_id, role)
      );

      -- Tags
      CREATE TABLE IF NOT EXISTS tags (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS item_tags (
        item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        tag_id  INTEGER NOT NULL REFERENCES tags(id),
        PRIMARY KEY (item_id, tag_id)
      );

      -- Attachments
      CREATE TABLE IF NOT EXISTS attachments (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id   INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        type      TEXT NOT NULL,
        filename  TEXT,
        path      TEXT,
        url       TEXT,
        mime_type TEXT,
        size      INTEGER,
        md5       TEXT
      );

      -- Notes
      CREATE TABLE IF NOT EXISTS notes (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        content    TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      -- Collection <-> Item
      CREATE TABLE IF NOT EXISTS collection_items (
        collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        item_id       INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        PRIMARY KEY (collection_id, item_id)
      );

      -- Sync state
      CREATE TABLE IF NOT EXISTS sync_state (
        key   TEXT PRIMARY KEY,
        value TEXT
      );

      -- Full-text search
      CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
        title, abstract,
        content='items', content_rowid='id',
        tokenize='unicode61'
      );

      INSERT INTO schema_version VALUES (1);
    `)
  }
}
