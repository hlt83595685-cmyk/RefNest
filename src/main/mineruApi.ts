import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { basename, join, dirname, extname } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { PDFDocument } from 'pdf-lib'
import AdmZip from 'adm-zip'

// ── Constants ─────────────────────────────────────────────────────────────────

const AGENT_BASE    = 'https://mineru.net/api/v1/agent/parse'
const PRECISION_BASE = 'https://mineru.net/api/v4'

// Max pages per MinerU Agent API request
const MAX_PAGES_PER_CHUNK = 20

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MinerUProgress {
  state: 'pending' | 'running' | 'done' | 'failed'
  message?: string
  chunk?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchJson(url: string, options: RequestInit): Promise<unknown> {
  const resp = await fetch(url, options)
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`HTTP ${resp.status}: ${text}`)
  }
  return resp.json()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── pdf-lib helpers ───────────────────────────────────────────────────────────

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

// ═══════════════════════════════════════════════════════════════════════════════
// Agent API (free, no token required)
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// Precision API (requires Bearer token, outputs zip with full.md + images)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Step 1: get a pre-signed upload URL + the resulting public file URL.
 * Uses the batch file-url endpoint with a single file entry.
 */
/**
 * Step 1: POST /api/v4/file-urls/batch
 * Returns { batchId, uploadUrl } where uploadUrl is the OSS pre-signed PUT URL.
 * The batch endpoint automatically submits the parse task once the file is uploaded.
 */
async function precisionBatchSubmit(
  fileName: string,
  token: string
): Promise<{ batchId: string; uploadUrl: string }> {
  const resp = await fetchJson(`${PRECISION_BASE}/file-urls/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      files: [{ name: fileName }],
      model_version: 'vlm',
      enable_formula: true,
      enable_table: true,
      language: 'ch',
    }),
  }) as {
    code: number
    msg: string
    data: { batch_id: string; file_urls: string[] }
  }
  if (resp.code !== 0) throw new Error(`MinerU batch submit error (${resp.code}): ${resp.msg}`)
  const uploadUrl = resp.data.file_urls?.[0]
  if (!uploadUrl) throw new Error('No upload URL returned from MinerU')
  return { batchId: resp.data.batch_id, uploadUrl }
}

/** Step 2: PUT file to OSS pre-signed URL. Must NOT send Content-Type header. */
async function precisionUploadFile(filePath: string, uploadUrl: string): Promise<void> {
  const fileBuffer = readFileSync(filePath)
  const resp = await fetch(uploadUrl, { method: 'PUT', body: fileBuffer })
  if (!resp.ok) throw new Error(`Upload failed: HTTP ${resp.status}`)
}

/** Step 3: Poll GET /api/v4/extract-results/batch/{batch_id} until done. Returns zip URL. */
async function precisionPollBatch(batchId: string, token: string): Promise<string> {
  for (let i = 0; i < 240; i++) {
    await sleep(5000)
    const resp = await fetchJson(`${PRECISION_BASE}/extract-results/batch/${batchId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }) as {
      code: number; msg: string
      data: {
        batch_id: string
        extract_result: Array<{
          file_name: string
          state: string
          err_msg?: string
          full_zip_url?: string
        }>
      }
    }
    if (resp.code !== 0) throw new Error(`Precision poll error: ${JSON.stringify(resp)}`)
    const result = resp.data.extract_result?.[0]
    if (!result) continue
    const { state, full_zip_url, err_msg } = result
    if (state === 'done') {
      if (!full_zip_url) throw new Error('No full_zip_url in precision result')
      return full_zip_url
    }
    if (state === 'failed') throw new Error(`Precision task failed: ${err_msg ?? 'unknown'}`)
    // states: waiting-file, pending, running, converting — keep polling
  }
  throw new Error('Timeout waiting for MinerU precision result (20 min)')
}

/**
 * Step 5: Download zip, extract full.md and images into outputDir.
 * Returns the path to full.md.
 */
async function precisionExtractZip(
  zipUrl: string,
  outputDir: string,
  stem: string
): Promise<string> {
  // Download zip
  const resp = await fetch(zipUrl)
  if (!resp.ok) throw new Error(`Download zip failed: HTTP ${resp.status}`)
  const zipBuf = Buffer.from(await resp.arrayBuffer())

  const zip = new AdmZip(zipBuf)
  const entries = zip.getEntries()

  // Ensure output images dir exists
  const imagesDir = join(outputDir, `${stem}_images`)
  mkdirSync(imagesDir, { recursive: true })

  let markdownContent = ''

  for (const entry of entries) {
    if (entry.isDirectory) continue
    const entryName = entry.entryName  // e.g. "full.md" or "images/figure_1.png"
    const entryBasename = basename(entryName)
    const ext = extname(entryName).toLowerCase()

    if (entryBasename === 'full.md') {
      markdownContent = entry.getData().toString('utf-8')
    } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) {
      // Save images into stem_images/
      const imgPath = join(imagesDir, entryBasename)
      writeFileSync(imgPath, entry.getData())
    }
  }

  if (!markdownContent) throw new Error('full.md not found in MinerU zip')

  // Rewrite relative image references to stem_images/basename — a path that is:
  //  - valid for external markdown viewers (relative to the .md file)
  //  - resolvable by MarkdownViewer via join(mdDir, relPath) → IPC readFile
  const imagesRelDir = `${stem}_images`
  markdownContent = markdownContent.replace(
    /!\[([^\]]*)\]\((?!https?:\/\/)([^)]+)\)/g,
    (match, alt, src) => {
      const imgBasename = basename(src)
      const candidate = join(imagesDir, imgBasename)
      if (existsSync(candidate)) {
        return `![${alt}](${imagesRelDir}/${imgBasename})`
      }
      return match
    }
  )

  const mdPath = join(outputDir, `${stem}.md`)
  writeFileSync(mdPath, markdownContent, 'utf-8')
  return mdPath
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public: Agent mode conversion
// ═══════════════════════════════════════════════════════════════════════════════

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
      writeFileSync(outPath, parts.join('\n\n---\n\n'), 'utf-8')
    } finally {
      try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  }

  onProgress?.({ state: 'done', message: '转换完成' })
  return outPath
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public: Precision API mode conversion
// ═══════════════════════════════════════════════════════════════════════════════

export async function convertPdfToMarkdownPrecision(
  filePath: string,
  token: string,
  onProgress?: (p: MinerUProgress) => void,
  outputPath?: string
): Promise<string> {
  const outputDir = dirname(outputPath ?? filePath)
  const stem = basename(outputPath ?? filePath, '.md') === basename(filePath, '.pdf')
    ? basename(filePath, '.pdf')
    : basename(outputPath ?? filePath, '.md')

  const fileName = basename(filePath)

  onProgress?.({ state: 'pending', message: '获取上传地址...' })
  const { batchId, uploadUrl } = await precisionBatchSubmit(fileName, token)

  onProgress?.({ state: 'running', message: '上传 PDF...' })
  await precisionUploadFile(filePath, uploadUrl)

  onProgress?.({ state: 'running', message: '精准解析中（VLM 模型，速度较慢）...' })
  const zipUrl = await precisionPollBatch(batchId, token)

  onProgress?.({ state: 'running', message: '下载并解压结果...' })
  const mdPath = await precisionExtractZip(zipUrl, outputDir, stem)

  onProgress?.({ state: 'done', message: '精准解析完成' })
  return mdPath
}

// ═══════════════════════════════════════════════════════════════════════════════
// Used by the Tools dialog (manual pick-pdf flow) — always uses Agent mode
// ═══════════════════════════════════════════════════════════════════════════════

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
