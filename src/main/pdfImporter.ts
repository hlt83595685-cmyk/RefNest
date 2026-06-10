import { readFileSync } from 'fs'
import { basename } from 'path'
import { createItem } from './db/items'
import { setCreatorsForItem } from './db/creators'

// ── PDF text extraction via pdf-parse ───────────────────────────────────────

async function extractPdfText(filePath: string): Promise<string> {
  // pdf-parse is a CJS-only Node library, safe to require() in Electron main
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('pdf-parse')
  const pdfParse = (mod.default ?? mod) as (
    buf: Buffer,
    opts?: { max?: number }
  ) => Promise<{ text: string }>

  const buf = readFileSync(filePath)
  // max: 8 — parse only first 8 pages to keep things fast
  const result = await pdfParse(buf, { max: 8 })
  return result.text
}

// ── DOI extraction ──────────────────────────────────────────────────────────

function extractDoi(text: string): string | null {
  const m = text.match(/\b(10\.\d{4,9}\/[^\s"'<>[\]{}|\\^`]+)/i)
  return m ? m[1].replace(/[.)]+$/, '') : null
}

// ── CrossRef lookup ─────────────────────────────────────────────────────────

interface CrossRefAuthor {
  family?: string
  given?: string
}

interface CrossRefWork {
  title?: string[]
  abstract?: string
  'container-title'?: string[]
  publisher?: string
  volume?: string
  issue?: string
  page?: string
  ISBN?: string[]
  language?: string
  type?: string
  DOI?: string
  URL?: string
  author?: CrossRefAuthor[]
  editor?: CrossRefAuthor[]
  published?: { 'date-parts'?: number[][] }
  'published-print'?: { 'date-parts'?: number[][] }
  'published-online'?: { 'date-parts'?: number[][] }
}

const CROSSREF_TYPE_MAP: Record<string, string> = {
  'journal-article': 'journalArticle',
  'book': 'book',
  'book-chapter': 'bookSection',
  'proceedings-article': 'conferencePaper',
  'dissertation': 'thesis',
  'report': 'report',
  'posted-content': 'preprint',
  'monograph': 'book',
}

async function fetchCrossRef(doi: string): Promise<CrossRefWork | null> {
  try {
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'RefNest/0.1 (mailto:user@refnest.app)' },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { message?: CrossRefWork }
    return json.message ?? null
  } catch {
    return null
  }
}

// ── Local heuristic fallback ─────────────────────────────────────────────────

interface LocalMeta {
  title: string | null
  abstract: string | null
  year: number | null
}

function parseLocalMeta(text: string, filename: string): LocalMeta {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 5)
  const title = (lines[0] ?? basename(filename, '.pdf')).slice(0, 200)

  const absMatch = text.match(/abstract[:\s]+(.{50,1200}?)(?:\n\n|\bintroduction\b)/is)
  const abstract = absMatch ? absMatch[1].replace(/\s+/g, ' ').trim() : null

  const yearMatch = text.match(/\b(19|20)\d{2}\b/)
  const year = yearMatch ? parseInt(yearMatch[0], 10) : null

  return { title, abstract, year }
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function importPDF(filePath: string): Promise<number> {
  let text: string
  try {
    text = await extractPdfText(filePath)
  } catch (err) {
    console.error('[pdfImporter] text extraction failed:', err)
    createItem({ type: 'journalArticle', title: basename(filePath, '.pdf') })
    return 1
  }

  const doi = extractDoi(text)
  console.log(`[pdfImporter] DOI found: ${doi ?? 'none'}`)

  let work: CrossRefWork | null = null
  if (doi) {
    console.log('[pdfImporter] Querying CrossRef...')
    work = await fetchCrossRef(doi)
    console.log(`[pdfImporter] CrossRef result: ${work ? 'OK' : 'not found / offline'}`)
  }

  if (work) {
    const dateObj =
      work.published?.['date-parts'] ??
      work['published-print']?.['date-parts'] ??
      work['published-online']?.['date-parts']
    const year = dateObj?.[0]?.[0] ?? null
    const type = CROSSREF_TYPE_MAP[work.type ?? ''] ?? 'journalArticle'

    const item = createItem({
      type,
      title: work.title?.[0] ?? null,
      abstract: work.abstract?.replace(/<[^>]+>/g, '').trim() ?? null,
      year,
      doi: work.DOI ?? doi,
      url: work.URL ?? null,
      journal: work['container-title']?.[0] ?? null,
      publisher: work.publisher ?? null,
      volume: work.volume ?? null,
      issue: work.issue ?? null,
      pages: work.page ?? null,
      isbn: work.ISBN?.[0] ?? null,
      language: work.language ?? null,
    })

    const authors = (work.author ?? []).map((a, i) => ({
      last_name: a.family ?? 'Unknown',
      first_name: a.given ?? null,
      role: 'author' as const,
      position: i,
    }))
    const editors = (work.editor ?? []).map((e, i) => ({
      last_name: e.family ?? 'Unknown',
      first_name: e.given ?? null,
      role: 'editor' as const,
      position: authors.length + i,
    }))
    const creators = [...authors, ...editors]
    if (creators.length) setCreatorsForItem(item.id, creators)
    console.log(`[pdfImporter] Imported via CrossRef: "${item.title}"`)
  } else {
    const meta = parseLocalMeta(text, filePath)
    const item = createItem({
      type: 'journalArticle',
      title: meta.title,
      abstract: meta.abstract,
      year: meta.year,
      doi: doi ?? null,
    })
    console.log(`[pdfImporter] Imported via local heuristic: "${item.title}"`)
  }

  return 1
}
