import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { AnnotationFactory } from 'annotpdf'

type Tool = 'none' | 'highlight' | 'underline' | 'strikeout' | 'note'

interface Props {
  filePath: string
}

interface PageState {
  canvas: HTMLCanvasElement
  viewport: pdfjsLib.PageViewport
  pageNum: number
}

// Yellow highlight color for annotpdf
const HIGHLIGHT_COLOR = { r: 255, g: 235, b: 59 }
const UNDERLINE_COLOR = { r: 30, g: 100, b: 255 }
const STRIKEOUT_COLOR = { r: 220, g: 40, b: 40 }

export function PdfAnnotationViewer({ filePath }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1.5)
  const [tool, setTool] = useState<Tool>('none')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [notePos, setNotePos] = useState<{ x: number; y: number; pdfX: number; pdfY: number; page: number } | null>(null)
  const pageStatesRef = useRef<Map<number, PageState>>(new Map())
  const workerInitRef = useRef(false)
  const renderedPagesRef = useRef<Set<number>>(new Set())

  // Initialize PDF.js worker via Blob URL (avoids CSP file:// restrictions)
  const initWorker = useCallback(async () => {
    if (workerInitRef.current) return
    workerInitRef.current = true
    const workerPath = await window.refnest.fs.pdfjsWorkerPath()
    const workerBytes = await window.refnest.fs.readFile(workerPath)
    const blob = new Blob([workerBytes], { type: 'text/javascript' })
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob)
  }, [])

  // Load PDF document
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    renderedPagesRef.current.clear()
    pageStatesRef.current.clear()

    async function load(): Promise<void> {
      try {
        await initWorker()
        const fileBytes = await window.refnest.fs.readFile(filePath)
        if (cancelled) return
        const uint8 = new Uint8Array(fileBytes.buffer ?? fileBytes)
        const doc = await pdfjsLib.getDocument({ data: uint8 }).promise
        if (cancelled) return
        setPdfDoc(doc)
        setNumPages(doc.numPages)
        setCurrentPage(1)
        setLoading(false)
      } catch (e) {
        if (!cancelled) setError(String(e))
      }
    }
    load()
    return () => { cancelled = true }
  }, [filePath, initWorker])

  // Render a single page onto its canvas
  const renderPage = useCallback(async (doc: pdfjsLib.PDFDocumentProxy, pageNum: number) => {
    if (renderedPagesRef.current.has(pageNum)) return
    const page = await doc.getPage(pageNum)
    const viewport = page.getViewport({ scale })
    const canvas = document.getElementById(`pdf-canvas-${pageNum}`) as HTMLCanvasElement | null
    if (!canvas) return
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    renderedPagesRef.current.add(pageNum)
    pageStatesRef.current.set(pageNum, { canvas, viewport, pageNum })
    await page.render({ canvasContext: ctx, viewport }).promise
  }, [scale])

  // Render all pages when doc or scale changes
  useEffect(() => {
    if (!pdfDoc) return
    renderedPagesRef.current.clear()
    async function renderAll(): Promise<void> {
      if (!pdfDoc) return
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        await renderPage(pdfDoc, i)
      }
    }
    renderAll()
  }, [pdfDoc, scale, renderPage])

  // Convert screen rect to PDF coordinates using pdfjs viewport
  function screenToPdf(
    viewport: pdfjsLib.PageViewport,
    x1: number, y1: number, x2: number, y2: number
  ): [number, number, number, number] {
    const [px1, py1] = viewport.convertToPdfPoint(x1, y1)
    const [px2, py2] = viewport.convertToPdfPoint(x2, y2)
    return [
      Math.min(px1, px2), Math.min(py1, py2),
      Math.max(px1, px2), Math.max(py1, py2),
    ]
  }

  // Get which page number a DOM element belongs to
  function getPageForElement(el: Element): number | null {
    const wrapper = el.closest('[data-page]') as HTMLElement | null
    if (!wrapper) return null
    return parseInt(wrapper.dataset.page ?? '0', 10) || null
  }

  // Handle text selection → create annotation
  const handleMouseUp = useCallback(async (e: React.MouseEvent) => {
    if (tool === 'none') return
    if (tool === 'note') return // handled by click

    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (rect.width < 2) return

    // Determine which page the selection is on
    const anchorEl = sel.anchorNode?.parentElement
    const pageNum = anchorEl ? getPageForElement(anchorEl) : null
    if (!pageNum) return

    const ps = pageStatesRef.current.get(pageNum)
    if (!ps) return

    const canvasRect = ps.canvas.getBoundingClientRect()
    const x1 = rect.left - canvasRect.left
    const y1 = rect.top - canvasRect.top
    const x2 = rect.right - canvasRect.left
    const y2 = rect.bottom - canvasRect.top

    const pdfRect = screenToPdf(ps.viewport, x1, y1, x2, y2)
    sel.removeAllRanges()

    setSaving(true)
    try {
      const fileBytes = await window.refnest.fs.readFile(filePath)
      const uint8 = new Uint8Array(fileBytes.buffer ?? fileBytes)
      const factory = new AnnotationFactory(uint8)

      if (tool === 'highlight') {
        factory.createHighlightAnnotation({
          page: pageNum - 1,
          rect: pdfRect,
          contents: '',
          author: 'RefNest',
          color: HIGHLIGHT_COLOR,
          opacity: 0.5,
        })
      } else if (tool === 'underline') {
        factory.createUnderlineAnnotation({
          page: pageNum - 1,
          rect: pdfRect,
          contents: '',
          author: 'RefNest',
          color: UNDERLINE_COLOR,
        })
      } else if (tool === 'strikeout') {
        factory.createStrikeOutAnnotation({
          page: pageNum - 1,
          rect: pdfRect,
          contents: '',
          author: 'RefNest',
          color: STRIKEOUT_COLOR,
        })
      }

      const result = factory.write()
      await window.refnest.fs.writeFile(filePath, result)

      // Re-render affected page
      renderedPagesRef.current.delete(pageNum)
      if (pdfDoc) {
        const uint8New = new Uint8Array(result)
        const newDoc = await pdfjsLib.getDocument({ data: uint8New }).promise
        const page = await newDoc.getPage(pageNum)
        const viewport = page.getViewport({ scale })
        const canvas = ps.canvas
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')!
        pageStatesRef.current.set(pageNum, { canvas, viewport, pageNum })
        renderedPagesRef.current.add(pageNum)
        await page.render({ canvasContext: ctx, viewport }).promise
      }
    } catch (err) {
      console.error('[PdfAnnotationViewer] annotation write failed:', err)
    } finally {
      setSaving(false)
    }
  }, [tool, filePath, pdfDoc, scale])

  // Handle note placement click
  const handleCanvasClick = useCallback((e: React.MouseEvent, pageNum: number) => {
    if (tool !== 'note') return
    const ps = pageStatesRef.current.get(pageNum)
    if (!ps) return
    const canvasRect = ps.canvas.getBoundingClientRect()
    const x = e.clientX - canvasRect.left
    const y = e.clientY - canvasRect.top
    const [pdfX, pdfY] = ps.viewport.convertToPdfPoint(x, y)
    setNotePos({ x: e.clientX, y: e.clientY, pdfX, pdfY, page: pageNum })
    setNoteText('')
  }, [tool])

  // Confirm note annotation
  const confirmNote = useCallback(async () => {
    if (!notePos) return
    setSaving(true)
    try {
      const fileBytes = await window.refnest.fs.readFile(filePath)
      const uint8 = new Uint8Array(fileBytes.buffer ?? fileBytes)
      const factory = new AnnotationFactory(uint8)
      factory.createTextAnnotation({
        page: notePos.page - 1,
        rect: [notePos.pdfX, notePos.pdfY, notePos.pdfX + 20, notePos.pdfY + 20],
        contents: noteText,
        author: 'RefNest',
      })
      const result = factory.write()
      await window.refnest.fs.writeFile(filePath, result)
      setNotePos(null)

      // Re-render page
      const ps = pageStatesRef.current.get(notePos.page)
      if (ps && pdfDoc) {
        renderedPagesRef.current.delete(notePos.page)
        const uint8New = new Uint8Array(result)
        const newDoc = await pdfjsLib.getDocument({ data: uint8New }).promise
        const page = await newDoc.getPage(notePos.page)
        const viewport = page.getViewport({ scale })
        ps.canvas.width = viewport.width
        ps.canvas.height = viewport.height
        const ctx = ps.canvas.getContext('2d')!
        pageStatesRef.current.set(notePos.page, { canvas: ps.canvas, viewport, pageNum: notePos.page })
        renderedPagesRef.current.add(notePos.page)
        await page.render({ canvasContext: ctx, viewport }).promise
      }
    } catch (err) {
      console.error('[PdfAnnotationViewer] note write failed:', err)
    } finally {
      setSaving(false)
    }
  }, [notePos, noteText, filePath, pdfDoc, scale])

  const toolBtnStyle = (t: Tool): React.CSSProperties => ({
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: tool === t ? 'var(--accent, #2563eb)' : 'var(--surface)',
    color: tool === t ? '#fff' : 'var(--foreground-2)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  })

  if (error) {
    return (
      <div style={{ padding: 32, color: 'red', fontSize: 13 }}>
        PDF 加载失败：{error}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      {/* Annotation toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 12px', height: 40, flexShrink: 0,
        background: 'rgba(242,242,247,0.9)',
        borderBottom: '1px solid var(--separator)',
      }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 4 }}>注释：</span>
        <button style={toolBtnStyle('none')} onClick={() => setTool('none')}>选择</button>
        <button style={toolBtnStyle('highlight')} onClick={() => setTool('highlight')}>🖊 高亮</button>
        <button style={toolBtnStyle('underline')} onClick={() => setTool('underline')}>U 下划线</button>
        <button style={toolBtnStyle('strikeout')} onClick={() => setTool('strikeout')}>S 删除线</button>
        <button style={toolBtnStyle('note')} onClick={() => setTool('note')}>📌 便签</button>

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 12, color: 'var(--muted)' }}>缩放：</span>
        <button style={{ ...toolBtnStyle('none'), padding: '4px 8px' }} onClick={() => setScale(s => Math.max(0.5, s - 0.25))}>−</button>
        <span style={{ fontSize: 12, minWidth: 36, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        <button style={{ ...toolBtnStyle('none'), padding: '4px 8px' }} onClick={() => setScale(s => Math.min(4, s + 0.25))}>+</button>

        {saving && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>保存中…</span>}
      </div>

      {/* Page scroll area */}
      <div
        ref={containerRef}
        style={{ flex: 1, overflowY: 'auto', background: '#525659', padding: '16px 0' }}
        onMouseUp={handleMouseUp}
      >
        {loading && (
          <div style={{ textAlign: 'center', color: '#ccc', paddingTop: 60, fontSize: 14 }}>
            加载中…
          </div>
        )}
        {!loading && Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
          <div
            key={pageNum}
            data-page={pageNum}
            style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}
            onClick={(e) => handleCanvasClick(e, pageNum)}
          >
            <canvas
              id={`pdf-canvas-${pageNum}`}
              style={{
                display: 'block',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                cursor: tool === 'note' ? 'crosshair' : tool !== 'none' ? 'text' : 'default',
              }}
            />
          </div>
        ))}
      </div>

      {/* Note input popup */}
      {notePos && (
        <div style={{
          position: 'fixed',
          left: notePos.x + 10,
          top: notePos.y + 10,
          zIndex: 1000,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 12,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column', gap: 8,
          minWidth: 220,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>添加便签</span>
          <textarea
            autoFocus
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            rows={3}
            style={{
              resize: 'none', fontSize: 13, padding: '4px 6px',
              border: '1px solid var(--border)', borderRadius: 4,
              background: 'var(--bg)',
            }}
            placeholder="输入注释内容…"
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => setNotePos(null)} style={{ ...toolBtnStyle('none'), padding: '3px 10px' }}>取消</button>
            <button onClick={confirmNote} style={{ ...toolBtnStyle('highlight'), padding: '3px 10px', background: '#2563eb' }}>确认</button>
          </div>
        </div>
      )}
    </div>
  )
}
