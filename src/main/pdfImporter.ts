import { readFileSync } from 'fs'
import { basename } from 'path'
import { createItem } from './db/items'
import { setCreatorsForItem } from './db/creators'
import { addAttachment } from './db/attachments'
import { addItemToCollection } from './db/collections'
import { setTagsForItem } from './db/tags'
import { fetchCrossRefByDoi, CROSSREF_TYPE_MAP, type CrossRefWork } from './crossref'

// ── PDF text extraction via pdf-parse ───────────────────────────────────────

async function extractPdfText(filePath: string): Promise<string> {
  // pdf-parse-new is a CJS-only Node library, safe to require() in Electron main
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse-new') as (
    buf: Buffer,
    opts?: { max?: number }
  ) => Promise<{ text: string }>

  const buf = readFileSync(filePath)
  const result = await pdfParse(buf, { max: 8 })
  return result.text
}

// ── DOI extraction ──────────────────────────────────────────────────────────

function extractDoi(text: string): string | null {
  const m = text.match(/\b(10\.\d{4,9}\/[^\s"'<>[\]{}|\\^`]+)/i)
  return m ? m[1].replace(/[.)]+$/, '') : null
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

// ── Keyword extraction from PDF text ────────────────────────────────────────

function extractKeywordsFromText(text: string): string[] {
  // Match "Keywords:", "Key words:", "Index Terms:" sections common in academic PDFs
  const m = text.match(
    /(?:keywords?|key\s+words?|index\s+terms?)\s*[:\-—]\s*([^\n]{5,300})/i
  )
  if (!m) return []
  return m[1]
    .split(/[;,·•|\/]/)
    .map((k) => k.trim().replace(/\.$/, ''))
    .filter((k) => k.length >= 2 && k.length <= 60)
    .slice(0, 15)
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function importPDF(filePath: string, collectionId?: number): Promise<number> {
  let text: string
  try {
    text = await extractPdfText(filePath)
  } catch (err) {
    console.error('[pdfImporter] text extraction failed:', err)
    const stub = createItem({ type: 'journalArticle', title: basename(filePath, '.pdf') })
    if (collectionId) addItemToCollection(collectionId, stub.id)
    try { addAttachment(stub.id, filePath) } catch { /* ignore */ }
    return 1
  }

  const doi = extractDoi(text)
  console.log(`[pdfImporter] DOI found: ${doi ?? 'none'}`)

  let work: CrossRefWork | null = null
  if (doi) {
    console.log('[pdfImporter] Querying CrossRef...')
    work = await fetchCrossRefByDoi(doi)
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
    if (collectionId) addItemToCollection(collectionId, item.id)

    const authors = (work.author ?? [])
      .filter((a) => a.family)
      .map((a, i) => ({
        last_name: a.family!,
        first_name: a.given ?? null,
        role: 'author' as const,
        position: i,
      }))
    const editors = (work.editor ?? [])
      .filter((e) => e.family)
      .map((e, i) => ({
        last_name: e.family!,
        first_name: e.given ?? null,
        role: 'editor' as const,
        position: authors.length + i,
      }))
    const creators = [...authors, ...editors]
    if (creators.length) setCreatorsForItem(item.id, creators)

    // Combine CrossRef subject + PDF keyword section
    const pdfKeywords = extractKeywordsFromText(text)
    const crSubjects = work.subject ?? []
    const allKeywords = [
      ...crSubjects,
      ...pdfKeywords.filter((k) => !crSubjects.some((s) => s.toLowerCase() === k.toLowerCase())),
    ]
    if (allKeywords.length) setTagsForItem(item.id, allKeywords)

    addAttachment(item.id, filePath)
    console.log(`[pdfImporter] Imported via CrossRef: "${item.title}" (${allKeywords.length} keywords)`)
  } else {
    const meta = parseLocalMeta(text, filePath)
    const item = createItem({
      type: 'journalArticle',
      title: meta.title,
      abstract: meta.abstract,
      year: meta.year,
      doi: doi ?? null,
    })
    if (collectionId) addItemToCollection(collectionId, item.id)

    // PDF-only: extract keywords from text
    const pdfKeywords = extractKeywordsFromText(text)
    if (pdfKeywords.length) setTagsForItem(item.id, pdfKeywords)

    addAttachment(item.id, filePath)
    console.log(`[pdfImporter] Imported via local heuristic: "${item.title}" (${pdfKeywords.length} keywords)`)
  }

  return 1
}
