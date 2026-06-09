import http from 'http'
import { createItem } from '../db/items'

const PORT = 23120
let server: http.Server | null = null

export function startLocalServer(): void {
  server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method === 'GET' && req.url === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', app: 'RefNest' }))
      return
    }

    if (req.method === 'POST' && req.url === '/save') {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        try {
          const data = JSON.parse(body)
          const item = createItem(data)
          res.writeHead(201, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, item }))
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: String(err) }))
        }
      })
      return
    }

    res.writeHead(404)
    res.end()
  })

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[RefNest] Local connector listening on http://127.0.0.1:${PORT}`)
  })
}

export function stopLocalServer(): void {
  server?.close()
  server = null
}
