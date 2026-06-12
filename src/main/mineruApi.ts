import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { basename, join, dirname } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { PDFDocument } from 'pdf-lib'

const AGENT_BASE = 'https://mineru.net/api/v1/agent/parse'

// Max pages per MinerU Agent API request
const MAX_PAGES_PER_CHUNK = 20

export interface MinerUProgress {
  state: 'pending' | 'running' | 'done' | 'failed'
  message?: string
  // chunk progress, e.g. "2/4"
  chunk?: string
}

// ── pdf-lib helpers ──────────────────────────────────────────────────────────

export async function getPdfPageCount(filePath: string): Promise<number> {
  const buf = readFileSync(filePath)
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true })
  return doc.getPageCount()
}

async function splitPdf(filePath: string, chunkSize: number, tmpDir: string): Promise<string[]> {
  const buf = readFileSync(filePath)
  const src = await PDFDocument.load(buf, { ignoreEncryption: true })
  const total = src.getPageCount()
  const chunks: string[] = []

  for (let start = 0; start < total; start += chunkSize) {
    const end = Math.min(start + chunkSize, total)
    const chunk = await PDFDocument.create()
    const pages = await chunk.copyPages(src, Array.from({ length: end - start }, (_, i) => start + i))
    pages.forEach((p) => chunk.addPage(p))

    const chunkBuf = await chunk.save()
    const stem = basename(filePath, '.pdf')
    const chunkPath = join(tmpDir, `${stem}_chunk${chunks.length + 1}.pdf`)
    writeFileSync(chunkPath, chunkBuf)
    chunks.push(chunkPath)
  }
  return chunks
}

// ── MinerU Agent API ─────────────────────────────────────────────────────────

async function fetchJson(url: string, options: RequestInit): Promise<unknown> {
  const resp = await fetch(url, options)
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`HTTP ${resp.status}: ${text}`)
  }
  return resp.json()
}

async function agentSubmitFile(filePath: string): Promise<string> {
  const fileName = basename(filePath)
  const sigResp = await fetchJson(`${AGENT_BASE}/file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_name: fileName, language: 'ch', enable_table: true, enable_formula: true }),
  }) as { code: number; data: { file_url: string; task_id: string }; msg: string }

  if (sigResp.code !== 0) throw new Error(`MinerU submit error: ${sigResp.msg}`)

  const { file_url, task_id } = sigResp.data
  const fileBuffer = readFileSync(filePath)

  // Pre-signed URL -- do NOT set Content-Type header
  const uploadResp = await fetch(file_url, { method: 'PUT', body: fileBuffer })
  if (!uploadResp.ok) throw new Error(`Upload failed: HTTP ${uploadResp.status}`)

  return task_id
}

async function agentPollResult(taskId: string): Promise<string> {
  for (let i = 0; i < 120; i++) {
    await sleep(3000)
    const resp = await fetchJson(`${AGENT_BASE}/${taskId}`, { method: 'GET' }) as {
      code: number
      data: { state: string; markdown_url?: string; err_msg?: string }
    }

    if (resp.code !== 0) throw new Error(`Poll error: ${JSON.stringify(resp)}`)

    const { state, markdown_url, err_msg } = resp.data
    if (state === 'done') {
      if (!markdown_url) throw new Error('No markdown_url in response')
      const mdResp = await fetch(markdown_url)
      if (!mdResp.ok) throw new Error(`Download markdown failed: HTTP ${mdResp.status}`)
      return mdResp.text()
    }
    if (state === 'failed') throw new Error(`Task failed: ${err_msg ?? 'unknown'}`)
  }
  throw new Error('Timeout waiting for MinerU result (6 min)')
}

// ── Public conversion entry point ─────────────────────────────────────────────

/**
 * Convert a PDF to Markdown using MinerU Agent API.
 * - If pages <= MAX_PAGES_PER_CHUNK: single upload
 * - If pages > MAX_PAGES_PER_CHUNK: split into chunks, convert each, merge
 *
 * Output .md is written alongside the PDF (same directory, same stem).
 * Returns the absolute path to the output .md file.
 */
export async function convertPdfToMarkdownAuto(
  filePath: string,
  onProgress?: (p: MinerUProgress) => void,
  outputPath?: string
): Promise<string> {
  const outputDir = dirname(filePath)
  const stem = basename(filePath, '.pdf')
  const outPath = outputPath ?? join(outputDir, `${stem}.md`)

  onProgress?.({ state: 'pending', message: '读取 PDF 页数...' })
  const pageCount = await getPdfPageCount(filePath)

  if (pageCount <= MAX_PAGES_PER_CHUNK) {
    onProgress?.({ state: 'running', message: `上传 PDF（${pageCount} 页）...` })
    const taskId = await agentSubmitFile(filePath)
    onProgress?.({ state: 'running', message: '解析中，请稍候...' })
    const markdown = await agentPollResult(taskId)
    writeFileSync(outPath, markdown, 'utf-8')
  } else {
    // Split into chunks
    const tmpDir = join(tmpdir(), `refnest-pdf2md-${randomUUID()}`)
    mkdirSync(tmpDir, { recursive: true })

    try {
      onProgress?.({ state: 'running', message: `拆分 PDF（${pageCount} 页 → 每块 ${MAX_PAGES_PER_CHUNK} 页）...` })
      const chunks = await splitPdf(filePath, MAX_PAGES_PER_CHUNK, tmpDir)
      const parts: string[] = []

      for (let i = 0; i < chunks.length; i++) {
        const chunkLabel = `${i + 1}/${chunks.length}`
        onProgress?.({ state: 'running', message: `上传第 ${chunkLabel} 块...`, chunk: chunkLabel })
        const taskId = await agentSubmitFile(chunks[i])
        onProgress?.({ state: 'running', message: `解析第 ${chunkLabel} 块...`, chunk: chunkLabel })
        const md = await agentPollResult(taskId)
        parts.push(md)
      }

      // Merge: join with a horizontal rule separator
      const merged = parts.join('\n\n---\n\n')
      writeFileSync(outPath, merged, 'utf-8')
    } finally {
      try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  }

  onProgress?.({ state: 'done', message: '转换完成' })
  return outPath
}

// ── Used by the settings dialog test ─────────────────────────────────────────

export async function convertPdfToMarkdown(
  filePath: string,
  outputDir: string,
  _opts: Record<string, unknown>,
  onProgress?: (p: MinerUProgress) => void
): Promise<string> {
  const stem = basename(filePath, '.pdf')
  const outPath = join(outputDir, `${stem}.md`)

  onProgress?.({ state: 'pending', message: '读取 PDF 页数...' })
  const pageCount = await getPdfPageCount(filePath)

  if (pageCount <= MAX_PAGES_PER_CHUNK) {
    onProgress?.({ state: 'running', message: `上传 PDF（${pageCount} 页）...` })
    const taskId = await agentSubmitFile(filePath)
    onProgress?.({ state: 'running', message: '解析中，请稍候...' })
    const markdown = await agentPollResult(taskId)
    writeFileSync(outPath, markdown, 'utf-8')
  } else {
    const tmpDir = join(tmpdir(), `refnest-pdf2md-${randomUUID()}`)
    mkdirSync(tmpDir, { recursive: true })
    try {
      onProgress?.({ state: 'running', message: `拆分 PDF（${pageCount} 页）...` })
      const chunks = await splitPdf(filePath, MAX_PAGES_PER_CHUNK, tmpDir)
      const parts: string[] = []

      for (let i = 0; i < chunks.length; i++) {
        const chunkLabel = `${i + 1}/${chunks.length}`
        onProgress?.({ state: 'running', message: `上传第 ${chunkLabel} 块...`, chunk: chunkLabel })
        const taskId = await agentSubmitFile(chunks[i])
        onProgress?.({ state: 'running', message: `解析第 ${chunkLabel} 块...`, chunk: chunkLabel })
        const md = await agentPollResult(taskId)
        parts.push(md)
      }

      writeFileSync(outPath, parts.join('\n\n---\n\n'), 'utf-8')
    } finally {
      try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  }

  onProgress?.({ state: 'done', message: '转换完成' })
  return outPath
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
