import { readFileSync } from 'fs'
import { basename } from 'path'
import { createItem } from './db/items'
import { setCreatorsForItem } from './db/creators'

// ── PDF text extraction via pdfjs-dist ──────────────────────────────────────


async function extractPdfText(filePath: string): Promise<string> {
  // pdfjs-dist requires a workerSrc; in Node (main process) use legacy build
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js') as typeof import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = ''

  const data = new Uint8Array(readFileSync(filePath))
  const doc = await pdfjsLib.getDocument({ data }).promise
  const pages: string[] = []
  // Extract first 8 pages -- enough for title/abstract/DOI, avoid massive PDFs
  const limit = Math.min(doc.numPages, 8)
  for (let i = 1; i <= limit; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = content.items
      .filter((item) => 'str' in item)
      .map((item) => (item as { str: string }).str)
      .join(' ')
    pages.push(text)
  }
  return pages.join('\n')
}

// ── DOI extraction ──────────────────────────────────────────────────────────

function extractDoi(text: string): string | null {
  // Matches: 10.XXXX/anything
  const m = text.match(/\b(10\.\d{4,9}\/[^\s"'<>[\]{}|\\^`]+)/i)
  return m ? m[1].replace(/[.)]+$/, '') : null
}

// ── CrossRef lookup ─────────────────────────────────────────────────────────

interface CrossRefAuthor {
  family?: string
  given?: string
  sequence?: string
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
    // Use built-in fetch (Node 18+ / Electron 20+)
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

// ── Local heuristic parser (fallback) ───────────────────────────────────────

interface LocalMeta {
  title: string | null
  abstract: string | null
  year: number | null
}

function parseLocalMeta(text: string, filename: string): LocalMeta {
  // Title: first non-empty line, capped at 200 chars
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 5)
  const title = (lines[0] ?? basename(filename, '.pdf')).slice(0, 200)

  // Abstract: text after "abstract" keyword up to 1200 chars
  const absMatch = text.match(/abstract[:\s]+(.{50,1200}?)(?:\n\n|\bintroduction\b)/is)
  const abstract = absMatch ? absMatch[1].replace(/\s+/g, ' ').trim() : null

  // Year: 4-digit year between 1900-2099
  const yearMatch = text.match(/\b(19|20)\d{2}\b/)
  const year = yearMatch ? parseInt(yearMatch[0], 10) : null

  return { title, abstract, year }
}

// ── Main export ─────────────────────────────────────────────────────────────

export async function importPDF(filePath: string): Promise<number> {
  let text: string
  try {
    text = await extractPdfText(filePath)
  } catch (err) {
    console.error('[pdfImporter] text extraction failed:', err)
    // Create a stub item with just the filename
    createItem({ type: 'journalArticle', title: basename(filePath, '.pdf') })
    return 1
  }

  const doi = extractDoi(text)
  let work: CrossRefWork | null = null
  if (doi) {
    work = await fetchCrossRef(doi)
  }

  if (work) {
    // Build item from CrossRef data
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
  } else {
    // Fallback: local heuristic
    const meta = parseLocalMeta(text, filePath)
    createItem({
      type: 'journalArticle',
      title: meta.title,
      abstract: meta.abstract,
      year: meta.year,
      doi: doi ?? null,
    })
  }

  return 1
}
