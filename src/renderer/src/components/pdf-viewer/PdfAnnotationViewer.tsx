import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { TextLayer } from 'pdfjs-dist'
import { AnnotationFactory } from 'annotpdf'
import 'pdfjs-dist/web/pdf_viewer.css'

type Tool = 'none' | 'highlight' | 'underline' | 'strikeout' | 'note'

interface Props {
  filePath: string
}

const HIGHLIGHT_COLOR = { r: 255, g: 235, b: 59 }
const UNDERLINE_COLOR = { r: 30, g: 100, b: 255 }
const STRIKEOUT_COLOR = { r: 220, g: 40, b: 40 }

// Pending note state — stores PDF-space coordinates, not screen coords
interface PendingNote {
  screenX: number
  screenY: number
  pdfX: number
  pdfY: number
  pageNum: number
}

export function PdfAnnotationViewer({ filePath }: Props): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.5)
  const [tool, setTool] = useState<Tool>('none')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [pendingNote, setPendingNote] = useState<PendingNote | null>(null)

  // worker init guard
  const workerReadyRef = useRef(false)
  // per-page viewport cache for coordinate conversion
  const viewportsRef = useRef<Map<number, pdfjsLib.PageViewport>>(new Map())

  const initWorker = useCallback(async () => {
    if (workerReadyRef.current) return
    workerReadyRef.current = true
    const workerPath = await window.refnest.fs.pdfjsWorkerPath()
    const workerBytes = await window.refnest.fs.readFile(workerPath)
    const blob = new Blob([workerBytes], { type: 'text/javascript' })
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob)
  }, [])

  // Load PDF
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    viewportsRef.current.clear()

    async function load(): Promise<void> {
      try {
        await initWorker()
        const fileBytes = await window.refnest.fs.readFile(filePath)
        if (cancelled) return
        const uint8 = new Uint8Array((fileBytes as unknown as { buffer?: ArrayBuffer }).buffer ?? fileBytes)
        const doc = await pdfjsLib.getDocument({ data: uint8 }).promise
        if (cancelled) return
        setPdfDoc(doc)
        setNumPages(doc.numPages)
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
  }, [filePath, initWorker])

  // Render one page: canvas + text layer
  const renderPage = useCallback(async (
    doc: pdfjsLib.PDFDocumentProxy,
    pageNum: number,
    currentScale: number
  ) => {
    const page = await doc.getPage(pageNum)
    const viewport = page.getViewport({ scale: currentScale })
    viewportsRef.current.set(pageNum, viewport)

    // Canvas
    const canvas = document.getElementById(`pdf-canvas-${pageNum}`) as HTMLCanvasElement | null
    if (!canvas) return
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport }).promise

    // Text layer — must be inside the page wrapper (position: relative)
    const wrapper = document.getElementById(`pdf-page-${pageNum}`)
    if (!wrapper) return

    // Remove old text layer if re-rendering
    const old = wrapper.querySelector('.textLayer')
    if (old) old.remove()

    const textLayerDiv = document.createElement('div')
    textLayerDiv.className = 'textLayer'
    // Size to match canvas exactly
    textLayerDiv.style.width = `${viewport.width}px`
    textLayerDiv.style.height = `${viewport.height}px`
    wrapper.appendChild(textLayerDiv)

    const textContent = await page.getTextContent()
    const tl = new TextLayer({
      textContentSource: textContent,
      container: textLayerDiv,
      viewport,
    })
    await tl.render()
  }, [])

  // Re-render all pages when doc or scale changes
  useEffect(() => {
    if (!pdfDoc) return
    viewportsRef.current.clear()
    async function renderAll(): Promise<void> {
      if (!pdfDoc) return
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        await renderPage(pdfDoc, i, scale)
      }
    }
    renderAll()
  }, [pdfDoc, scale, renderPage])

  // Re-render a single page from fresh PDF bytes (after writing annotation)
  const rerenderPageFromBytes = useCallback(async (pageNum: number, pdfBytes: Uint8Array) => {
    const newDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise
    await renderPage(newDoc, pageNum, scale)
    // We don't need to keep newDoc open; pages are rendered
    newDoc.destroy()
  }, [scale, renderPage])

  // Convert selection screen rect → PDF coordinates for the given page
  function selectionToPdfRect(
    viewport: pdfjsLib.PageViewport,
    canvasEl: HTMLCanvasElement,
    selRect: DOMRect
  ): [number, number, number, number] {
    const cr = canvasEl.getBoundingClientRect()
    const x1s = selRect.left - cr.left
    const y1s = selRect.top - cr.top
    const x2s = selRect.right - cr.left
    const y2s = selRect.bottom - cr.top

    const [x1p, y1p] = viewport.convertToPdfPoint(x1s, y1s)
    const [x2p, y2p] = viewport.convertToPdfPoint(x2s, y2s)
    return [
      Math.min(x1p, x2p), Math.min(y1p, y2p),
      Math.max(x1p, x2p), Math.max(y1p, y2p),
    ]
  }

  // Determine which page a DOM node belongs to (via data-page attribute on wrapper)
  function pageNumOfNode(node: Node | null): number | null {
    let el = node instanceof Element ? node : node?.parentElement
    while (el) {
      const p = (el as HTMLElement).dataset?.page
      if (p) return parseInt(p, 10)
      el = el.parentElement
    }
    return null
  }

  // Handle mouseup — create text-markup annotations from selection
  const handleMouseUp = useCallback(async () => {
    if (tool === 'none' || tool === 'note') return

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

    setSaving(true)
    try {
      const fileBytes = await window.refnest.fs.readFile(filePath)
      const uint8 = new Uint8Array((fileBytes as unknown as { buffer?: ArrayBuffer }).buffer ?? fileBytes)
      const factory = new AnnotationFactory(uint8)

      const base = { page: pageNum - 1, rect: pdfRect, contents: '', author: 'RefNest' }

      if (tool === 'highlight') {
        factory.createHighlightAnnotation({ ...base, color: HIGHLIGHT_COLOR, opacity: 0.5 })
      } else if (tool === 'underline') {
        factory.createUnderlineAnnotation({ ...base, color: UNDERLINE_COLOR })
      } else if (tool === 'strikeout') {
        factory.createStrikeOutAnnotation({ ...base, color: STRIKEOUT_COLOR })
      }

      const result = factory.write()
      await window.refnest.fs.writeFile(filePath, result)
      await rerenderPageFromBytes(pageNum, result)
    } catch (err) {
      console.error('[PdfAnnotationViewer] annotation failed:', err)
    } finally {
      setSaving(false)
    }
  }, [tool, filePath, rerenderPageFromBytes])

  // Handle canvas click for note tool
  const handlePageClick = useCallback((e: React.MouseEvent, pageNum: number) => {
    if (tool !== 'note') return
    const viewport = viewportsRef.current.get(pageNum)
    const canvas = document.getElementById(`pdf-canvas-${pageNum}`) as HTMLCanvasElement | null
    if (!viewport || !canvas) return

    const cr = canvas.getBoundingClientRect()
    const xs = e.clientX - cr.left
    const ys = e.clientY - cr.top
    const [pdfX, pdfY] = viewport.convertToPdfPoint(xs, ys)

    setPendingNote({ screenX: e.clientX, screenY: e.clientY, pdfX, pdfY, pageNum })
    setNoteText('')
  }, [tool])

  // Confirm and save sticky note
  const confirmNote = useCallback(async () => {
    if (!pendingNote) return
    setSaving(true)
    try {
      const fileBytes = await window.refnest.fs.readFile(filePath)
      const uint8 = new Uint8Array((fileBytes as unknown as { buffer?: ArrayBuffer }).buffer ?? fileBytes)
      const factory = new AnnotationFactory(uint8)

      factory.createTextAnnotation({
        page: pendingNote.pageNum - 1,
        rect: [pendingNote.pdfX, pendingNote.pdfY, pendingNote.pdfX + 20, pendingNote.pdfY + 20],
        contents: noteText,
        author: 'RefNest',
      })

      const result = factory.write()
      await window.refnest.fs.writeFile(filePath, result)
      setPendingNote(null)
      await rerenderPageFromBytes(pendingNote.pageNum, result)
    } catch (err) {
      console.error('[PdfAnnotationViewer] note save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [pendingNote, noteText, filePath, rerenderPageFromBytes])

  const btnStyle = (t: Tool): React.CSSProperties => ({
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: tool === t ? '#2563eb' : 'var(--surface)',
    color: tool === t ? '#fff' : 'var(--foreground-2)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    userSelect: 'none',
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
        <button style={btnStyle('underline')} onClick={() => setTool('underline')}>U 下划线</button>
        <button style={btnStyle('strikeout')} onClick={() => setTool('strikeout')}>S 删除线</button>
        <button style={btnStyle('note')}      onClick={() => setTool('note')}>📌 便签</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>缩放：</span>
        <button style={{ ...btnStyle('none'), padding: '4px 8px' }} onClick={() => setScale(s => Math.max(0.5, +(s - 0.25).toFixed(2)))}>−</button>
        <span style={{ fontSize: 12, minWidth: 38, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        <button style={{ ...btnStyle('none'), padding: '4px 8px' }} onClick={() => setScale(s => Math.min(4, +(s + 0.25).toFixed(2)))}>+</button>
        {saving && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>保存中…</span>}
      </div>

      {/* Scroll area */}
      <div
        ref={scrollRef}
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
            style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}
          >
            {/*
              Page wrapper: position:relative so the text layer (position:absolute)
              anchors correctly on top of the canvas.
            */}
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
              {/* TextLayer is injected here by renderPage() */}
            </div>
          </div>
        ))}
      </div>

      {/* Sticky note input popup */}
      {pendingNote && (
        <div style={{
          position: 'fixed',
          left: Math.min(pendingNote.screenX + 12, window.innerWidth - 250),
          top: Math.min(pendingNote.screenY + 12, window.innerHeight - 160),
          zIndex: 1000,
          background: 'var(--surface, #fff)',
          border: '1px solid var(--border, #d1d5db)',
          borderRadius: 8,
          padding: 12,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          display: 'flex', flexDirection: 'column', gap: 8,
          minWidth: 230,
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
            <button
              onClick={confirmNote}
              style={{ ...btnStyle('none'), background: '#2563eb', color: '#fff', border: 'none' }}
            >
              确认
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
