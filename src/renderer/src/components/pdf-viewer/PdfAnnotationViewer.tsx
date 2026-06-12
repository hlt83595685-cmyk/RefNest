import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { TextLayer } from 'pdfjs-dist'
import { AnnotationFactory } from 'annotpdf'
import 'pdfjs-dist/web/pdf_viewer.css'

type Tool = 'none' | 'highlight' | 'note'

interface Props {
  filePath: string
}

const HIGHLIGHT_COLOR = { r: 255, g: 220, b: 0 }

interface PendingNote {
  screenX: number
  screenY: number
  pdfX: number
  pdfY: number
  pageNum: number
}

export function PdfAnnotationViewer({ filePath }: Props): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)

  // The current PDF document proxy — update this to trigger a full re-render
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.5)
  const [tool, setTool] = useState<Tool>('none')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [pendingNote, setPendingNote] = useState<PendingNote | null>(null)

  const workerReadyRef = useRef(false)
  // Always holds the latest PDF bytes on disk — used when writing annotations
  const pdfBytesRef = useRef<Uint8Array | null>(null)
  // viewport cache for coordinate conversion
  const viewportsRef = useRef<Map<number, pdfjsLib.PageViewport>>(new Map())

  const initWorker = useCallback(async () => {
    if (workerReadyRef.current) return
    workerReadyRef.current = true
    const workerPath = await window.refnest.fs.pdfjsWorkerPath()
    const workerBytes = await window.refnest.fs.readFile(workerPath)
    const blob = new Blob([workerBytes], { type: 'text/javascript' })
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob)
  }, [])

  // Load PDF from disk into pdfBytesRef and pdfDoc state
  const loadPdf = useCallback(async (bytes: Uint8Array) => {
    pdfBytesRef.current = bytes
    viewportsRef.current.clear()
    const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
    setPdfDoc(prev => {
      prev?.destroy()
      return doc
    })
    setNumPages(doc.numPages)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load(): Promise<void> {
      try {
        await initWorker()
        const raw = await window.refnest.fs.readFile(filePath)
        if (cancelled) return
        // IPC returns a Buffer-like object; ensure plain Uint8Array
        const bytes = raw instanceof Uint8Array
          ? raw
          : new Uint8Array((raw as unknown as { buffer: ArrayBuffer }).buffer)
        await loadPdf(bytes)
        setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setError(String(e))
          setLoading(false)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [filePath, initWorker, loadPdf])

  // Render a single page: canvas + TextLayer
  const renderPage = useCallback(async (
    doc: pdfjsLib.PDFDocumentProxy,
    pageNum: number,
    currentScale: number
  ) => {
    const page = await doc.getPage(pageNum)
    const viewport = page.getViewport({ scale: currentScale })
    viewportsRef.current.set(pageNum, viewport)

    const canvas = document.getElementById(`pdf-canvas-${pageNum}`) as HTMLCanvasElement | null
    if (!canvas) return
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise

    // Replace TextLayer
    const wrapper = document.getElementById(`pdf-page-${pageNum}`)
    if (!wrapper) return
    wrapper.querySelector('.textLayer')?.remove()

    const textDiv = document.createElement('div')
    textDiv.className = 'textLayer'
    textDiv.style.width = `${viewport.width}px`
    textDiv.style.height = `${viewport.height}px`
    wrapper.appendChild(textDiv)

    const textContent = await page.getTextContent()
    const tl = new TextLayer({ textContentSource: textContent, container: textDiv, viewport })
    await tl.render()
  }, [])

  // Re-render all pages whenever pdfDoc or scale changes
  useEffect(() => {
    if (!pdfDoc) return
    viewportsRef.current.clear()
    let cancelled = false
    async function renderAll(): Promise<void> {
      for (let i = 1; i <= pdfDoc!.numPages; i++) {
        if (cancelled) return
        await renderPage(pdfDoc!, i, scale)
      }
    }
    renderAll()
    return () => { cancelled = true }
  }, [pdfDoc, scale, renderPage])

  // Write annotation bytes, persist to disk, reload doc
  const applyAnnotation = useCallback(async (
    mutate: (factory: AnnotationFactory) => void
  ) => {
    if (!pdfBytesRef.current) return
    setSaving(true)
    try {
      const factory = new AnnotationFactory(pdfBytesRef.current)
      mutate(factory)
      const result = factory.write()
      await window.refnest.fs.writeFile(filePath, result)
      // Reload from the new bytes — this updates pdfDoc, which triggers renderAll
      await loadPdf(result)
    } catch (err) {
      console.error('[PdfAnnotationViewer] annotation failed:', err)
    } finally {
      setSaving(false)
    }
  }, [filePath, loadPdf])

  // Get page number from a DOM node (walks up to find data-page)
  function pageNumOfNode(node: Node | null): number | null {
    let el = node instanceof Element ? node : node?.parentElement
    while (el) {
      const p = (el as HTMLElement).dataset?.page
      if (p) return parseInt(p, 10)
      el = el.parentElement
    }
    return null
  }

  // Convert selection DOMRect → PDF coordinate rect
  function selectionToPdfRect(
    viewport: pdfjsLib.PageViewport,
    canvas: HTMLCanvasElement,
    selRect: DOMRect
  ): [number, number, number, number] {
    const cr = canvas.getBoundingClientRect()
    const [x1p, y1p] = viewport.convertToPdfPoint(selRect.left - cr.left, selRect.top - cr.top)
    const [x2p, y2p] = viewport.convertToPdfPoint(selRect.right - cr.left, selRect.bottom - cr.top)
    return [Math.min(x1p, x2p), Math.min(y1p, y2p), Math.max(x1p, x2p), Math.max(y1p, y2p)]
  }

  const handleMouseUp = useCallback(async () => {
    if (tool !== 'highlight') return

    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const selRect = range.getBoundingClientRect()
    if (selRect.width < 2 || selRect.height < 2) return

    const pageNum = pageNumOfNode(sel.anchorNode)
    if (!pageNum) return

    const viewport = viewportsRef.current.get(pageNum)
    const canvas = document.getElementById(`pdf-canvas-${pageNum}`) as HTMLCanvasElement | null
    if (!viewport || !canvas) return

    const pdfRect = selectionToPdfRect(viewport, canvas, selRect)
    sel.removeAllRanges()

    await applyAnnotation(factory => {
      factory.createHighlightAnnotation({
        page: pageNum - 1,
        rect: pdfRect,
        contents: '',
        author: 'RefNest',
        color: HIGHLIGHT_COLOR,
        opacity: 0.5,
      })
    })
  }, [tool, applyAnnotation])

  const handlePageClick = useCallback((e: React.MouseEvent, pageNum: number) => {
    if (tool !== 'note') return
    const viewport = viewportsRef.current.get(pageNum)
    const canvas = document.getElementById(`pdf-canvas-${pageNum}`) as HTMLCanvasElement | null
    if (!viewport || !canvas) return

    const cr = canvas.getBoundingClientRect()
    const [pdfX, pdfY] = viewport.convertToPdfPoint(e.clientX - cr.left, e.clientY - cr.top)
    setPendingNote({ screenX: e.clientX, screenY: e.clientY, pdfX, pdfY, pageNum })
    setNoteText('')
  }, [tool])

  const confirmNote = useCallback(async () => {
    if (!pendingNote) return
    setPendingNote(null)
    await applyAnnotation(factory => {
      factory.createTextAnnotation({
        page: pendingNote.pageNum - 1,
        rect: [pendingNote.pdfX, pendingNote.pdfY, pendingNote.pdfX + 20, pendingNote.pdfY + 20],
        contents: noteText,
        author: 'RefNest',
      })
    })
  }, [pendingNote, noteText, applyAnnotation])

  const btnStyle = (t: Tool): React.CSSProperties => ({
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: tool === t ? '#2563eb' : 'var(--surface)',
    color: tool === t ? '#fff' : 'var(--foreground-2)',
    fontSize: 12, fontWeight: 500, cursor: 'pointer', userSelect: 'none',
  })

  if (error) {
    return <div style={{ padding: 32, color: 'red', fontSize: 13 }}>PDF 加载失败：{error}</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 12px', height: 40, flexShrink: 0,
        background: 'rgba(242,242,247,0.9)',
        borderBottom: '1px solid var(--separator)',
        userSelect: 'none',
      }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 2 }}>注释：</span>
        <button style={btnStyle('none')}      onClick={() => setTool('none')}>选择</button>
        <button style={btnStyle('highlight')} onClick={() => setTool('highlight')}>🖊 高亮</button>
        <button style={btnStyle('note')}      onClick={() => setTool('note')}>📌 便签</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>缩放：</span>
        <button style={{ ...btnStyle('none'), padding: '4px 8px' }}
          onClick={() => setScale(s => Math.max(0.5, +(s - 0.25).toFixed(2)))}>−</button>
        <span style={{ fontSize: 12, minWidth: 38, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        <button style={{ ...btnStyle('none'), padding: '4px 8px' }}
          onClick={() => setScale(s => Math.min(4, +(s + 0.25).toFixed(2)))}>+</button>
        {saving && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>保存中…</span>}
      </div>

      {/* Scroll area */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: 'auto', background: '#525659', padding: '16px 0' }}
        onMouseUp={handleMouseUp}
      >
        {loading && (
          <div style={{ textAlign: 'center', color: '#ccc', paddingTop: 60, fontSize: 14 }}>加载中…</div>
        )}
        {!loading && Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
          <div key={pageNum} style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div
              id={`pdf-page-${pageNum}`}
              data-page={pageNum}
              style={{ position: 'relative', lineHeight: 0 }}
              onClick={(e) => handlePageClick(e, pageNum)}
            >
              <canvas
                id={`pdf-canvas-${pageNum}`}
                style={{
                  display: 'block',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                  cursor: tool === 'note' ? 'crosshair' : 'default',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Note popup */}
      {pendingNote && (
        <div style={{
          position: 'fixed',
          left: Math.min(pendingNote.screenX + 12, window.innerWidth - 260),
          top: Math.min(pendingNote.screenY + 12, window.innerHeight - 170),
          zIndex: 1000,
          background: 'var(--surface, #fff)',
          border: '1px solid var(--border, #d1d5db)',
          borderRadius: 8, padding: 12,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          display: 'flex', flexDirection: 'column', gap: 8, minWidth: 230,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>添加便签</span>
          <textarea
            autoFocus
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) confirmNote() }}
            rows={3}
            style={{
              resize: 'none', fontSize: 13, padding: '4px 6px',
              border: '1px solid var(--border, #d1d5db)', borderRadius: 4,
              background: 'var(--bg, #f9fafb)',
            }}
            placeholder="输入注释内容… (Ctrl+Enter 确认)"
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => setPendingNote(null)} style={btnStyle('none')}>取消</button>
            <button onClick={confirmNote}
              style={{ ...btnStyle('none'), background: '#2563eb', color: '#fff', border: 'none' }}>
              确认
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
