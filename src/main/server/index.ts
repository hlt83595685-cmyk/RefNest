import http from 'http'
import { createItem } from '../db/items'
import { setCreatorsForItem } from '../db/creators'
import { getAllCollections, addItemToCollection } from '../db/collections'
import { addAttachmentFromUrl } from '../db/attachments'
import { fetchCrossRefByDoi } from '../crossref'

const PORT = 23119
let server: http.Server | null = null

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
  res.end(body)
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => resolve(body))
  })
}

export function startLocalServer(): void {
  server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS)
      res.end()
      return
    }

    // Strip query string for route matching
    const url = (req.url ?? '/').split('?')[0]

    try {
      // GET /ping — health check
      if (req.method === 'GET' && url === '/ping') {
        return json(res, 200, { status: 'ok', app: 'RefNest', version: '0.1.0' })
      }

      // GET /collections — list user collections for popup
      if (req.method === 'GET' && url === '/collections') {
        const cols = getAllCollections()
        return json(res, 200, { collections: cols })
      }

      // POST /lookup — resolve DOI via CrossRef, return metadata preview
      if (req.method === 'POST' && url === '/lookup') {
        const body = JSON.parse(await readBody(req))
        const doi: string | undefined = body.doi
        if (!doi) return json(res, 400, { error: 'doi required' })
        const work = await fetchCrossRefByDoi(doi)
        return json(res, 200, { found: !!work, metadata: work })
      }

      // POST /save — save item (from browser plugin)
      if (req.method === 'POST' && url === '/save') {
        const body = JSON.parse(await readBody(req))
        let {
          type, title, abstract, year, doi, url: itemUrl,
          journal, publisher, volume, issue, pages, isbn, language,
          authors = [], collectionId, pdf_url,
        } = body

        // Server-side CrossRef enrichment: fill any missing fields from CrossRef
        if (doi) {
          try {
            const cr = await fetchCrossRefByDoi(doi)
            if (cr) {
              const dateParts =
                cr.published?.['date-parts'] ??
                cr['published-print']?.['date-parts'] ??
                cr['published-online']?.['date-parts']
              title     = title     || cr.title?.[0]
              abstract  = abstract  || cr.abstract?.replace(/<[^>]+>/g, '').trim()
              year      = year      || dateParts?.[0]?.[0]
              journal   = journal   || cr['container-title']?.[0]
              publisher = publisher || cr.publisher
              volume    = volume    || cr.volume
              issue     = issue     || cr.issue
              pages     = pages     || cr.page
              if (!authors.length && cr.author?.length) {
                authors = cr.author
                  .filter((a: { family?: string }) => a.family)
                  .map((a: { family: string; given?: string }) => ({
                    last_name: a.family, first_name: a.given ?? null,
                  }))
              }
            }
          } catch { /* CrossRef failure is non-fatal */ }
        }

        const item = createItem({
          type: type ?? 'journalArticle',
          title, abstract,
          year: year ? Number(year) : null,
          doi, url: itemUrl,
          journal, publisher, volume, issue, pages, isbn, language,
        })

        if (authors.length) {
          setCreatorsForItem(
            item.id,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            authors.map((a: any, i: number) => ({
              last_name: a.last_name ?? a.family ?? 'Unknown',
              first_name: a.first_name ?? a.given ?? null,
              role: 'author' as const,
              position: i,
            }))
          )
        }

        if (collectionId) {
          try { addItemToCollection(Number(collectionId), item.id) } catch { /* ignore */ }
        }

        // Download PDF attachment if url provided
        if (pdf_url) {
          addAttachmentFromUrl(item.id, pdf_url).catch(() => { /* non-fatal */ })
        }

        return json(res, 201, { success: true, item })
      }

      json(res, 404, { error: 'not found' })
    } catch (err) {
      console.error('[server] handler error:', err)
      json(res, 500, { error: String(err) })
    }
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[RefNest] Port ${PORT} already in use — local connector disabled`)
    } else {
      console.error('[RefNest] Server error:', err)
    }
  })

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[RefNest] Local connector listening on http://127.0.0.1:${PORT}`)
  })
}

export function stopLocalServer(): void {
  server?.close()
  server = null
}
