export interface CrossRefAuthor {
  family?: string
  given?: string
}

export interface CrossRefWork {
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

export const CROSSREF_TYPE_MAP: Record<string, string> = {
  'journal-article':    'journalArticle',
  'book':               'book',
  'book-chapter':       'bookSection',
  'proceedings-article':'conferencePaper',
  'dissertation':       'thesis',
  'report':             'report',
  'posted-content':     'preprint',
  'monograph':          'book',
}

export async function fetchCrossRefByDoi(doi: string): Promise<CrossRefWork | null> {
  try {
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'RefNest/0.1 (mailto:user@refnest.app)' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { message?: CrossRefWork }
    return data.message ?? null
  } catch {
    return null
  }
}
