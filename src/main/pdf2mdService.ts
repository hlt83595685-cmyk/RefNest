import { join, dirname, basename } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { app, BrowserWindow } from 'electron'
import { registerAttachment, getAttachmentsByItem } from './db/attachments'
import { convertPdfToMarkdownAuto } from './mineruApi'

// ── Window reference ──────────────────────────────────────────────────────────

let _mainWindow: BrowserWindow | null = null

export function setMainWindowRef(win: BrowserWindow): void {
  _mainWindow = win
}

function pushStatus(event: Pdf2mdStatusEvent): void {
  _mainWindow?.webContents.send('pdf2md:status', event)
}

export type Pdf2mdTaskState = 'running' | 'done' | 'error' | 'idle'

export interface Pdf2mdStatusEvent {
  filename: string
  state: Pdf2mdTaskState
  message: string
  chunk?: string
  pending: number   // jobs still waiting in queue (excluding current)
}

// ── Settings ──────────────────────────────────────────────────────────────────

let _settingsCache: Record<string, unknown> | null = null

function settingsPath(): string {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'refnest-settings.json')
}

function loadSettings(): Record<string, unknown> {
  if (_settingsCache) return _settingsCache
  try { _settingsCache = JSON.parse(readFileSync(settingsPath(), 'utf-8')) }
  catch { _settingsCache = {} }
  return _settingsCache!
}

export function saveSettings(patch: Record<string, unknown>): void {
  const current = loadSettings()
  _settingsCache = { ...current, ...patch }
  writeFileSync(settingsPath(), JSON.stringify(_settingsCache, null, 2), 'utf-8')
}

export function isPdf2mdEnabled(): boolean {
  return loadSettings()['tool.pdf2md.enabled'] !== false
}

export function getStoragePath(): string | null {
  const v = loadSettings()['storage.path']
  return typeof v === 'string' && v ? v : null
}

export function saveStoragePath(p: string): void {
  saveSettings({ 'storage.path': p })
}

// ── Serial queue ──────────────────────────────────────────────────────────────

interface QueueItem {
  itemId: number
  pdfPath: string
  outputPath?: string  // explicit output file path (used for versioned re-conversion)
}

const _queue: QueueItem[] = []
let _running = false

async function drainQueue(): Promise<void> {
  if (_running) return
  _running = true

  while (_queue.length > 0) {
    const job = _queue.shift()!
    await runConversion(job)
  }

  _running = false
}

async function runConversion(job: QueueItem): Promise<void> {
  const { itemId, pdfPath, outputPath } = job
  const filename = basename(pdfPath)

  const push = (state: Pdf2mdTaskState, message: string, chunk?: string): void => {
    pushStatus({ filename, state, message, chunk, pending: _queue.length })
  }

  console.log(`[pdf2md] Converting: ${pdfPath}${outputPath ? ` -> ${outputPath}` : ''}`)
  push('running', '准备中...')

  try {
    const outPath = await convertPdfToMarkdownAuto(pdfPath, (p) => {
      const msg = p.message ?? p.state
      console.log(`[pdf2md]${p.chunk ? ` [${p.chunk}]` : ''} ${msg}`)
      push('running', msg, p.chunk)
    }, outputPath)
    registerAttachment(itemId, outPath)
    console.log(`[pdf2md] Done: ${outPath}`)
    push('done', '转换完成')
  } catch (err) {
    const msg = (err as Error).message
    console.error(`[pdf2md] Failed: ${pdfPath}`, err)
    push('error', msg)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Enqueue a PDF for conversion. Returns immediately; conversion happens
 * serially in the background so multiple imports never run concurrently.
 */
export function autoConvertPdfToMd(itemId: number, pdfPath: string): void {
  if (!isPdf2mdEnabled()) return

  const existing = getAttachmentsByItem(itemId)
  const mdPath = join(dirname(pdfPath), `${basename(pdfPath, '.pdf')}.md`)

  if (existing.some((a) => a.path === mdPath)) {
    console.log(`[pdf2md] Already converted: ${mdPath}`)
    return
  }
  if (existsSync(mdPath)) {
    registerAttachment(itemId, mdPath)
    console.log(`[pdf2md] Registered existing .md: ${mdPath}`)
    return
  }

  _queue.push({ itemId, pdfPath })
  drainQueue().catch((err) => console.error('[pdf2md] Queue error:', err))
}

/**
 * Manually trigger conversion for an item from the context menu.
 * If a .md already exists for this PDF, append a version suffix (-1, -2, ...).
 * Returns an error string if no PDF attachment found, otherwise enqueues.
 */
export function manualConvertPdfToMd(itemId: number): string | null {
  const attachments = getAttachmentsByItem(itemId)
  const pdfAtt = attachments.find(
    (a) => a.mime_type === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf')
  )
  if (!pdfAtt?.path) return 'no_pdf'

  const pdfPath = pdfAtt.path
  const dir = dirname(pdfPath)
  const stem = basename(pdfPath, '.pdf')

  // Determine versioned output path
  const baseMd = join(dir, `${stem}.md`)
  let outputPath = baseMd
  if (existsSync(baseMd) || attachments.some((a) => a.path === baseMd)) {
    let version = 1
    while (true) {
      const candidate = join(dir, `${stem}-${version}.md`)
      if (!existsSync(candidate) && !attachments.some((a) => a.path === candidate)) {
        outputPath = candidate
        break
      }
      version++
    }
  }

  _queue.push({ itemId, pdfPath, outputPath })
  drainQueue().catch((err) => console.error('[pdf2md] Queue error:', err))
  return null
}
