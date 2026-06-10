import http from 'http'
import { createItem, getAllItems } from '../db/items'
import { setCreatorsForItem } from '../db/creators'
import { getAllCollections } from '../db/collections'
import { addAttachment } from '../db/attachments'
import { fetchCrossRefByDoi } from '../crossref'

const PORT = 23120
let server: http.Server | null = null

function json(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'http://localhost',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-RefNest-Token',
  })
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
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-RefNest-Token')
      res.writeHead(204)
      res.end()
      return
    }

    res.setHeader('Access-Control-Allow-Origin', '*')

    const url = req.url ?? '/'

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
        const {
          type, title, abstract, year, doi, url: itemUrl,
          journal, publisher, volume, issue, pages, isbn, language,
          authors = [], collectionId,
        } = body

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
          try {
            const { addItemToCollection } = await import('../db/collections')
            addItemToCollection(collectionId, item.id)
          } catch { /* ignore */ }
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
