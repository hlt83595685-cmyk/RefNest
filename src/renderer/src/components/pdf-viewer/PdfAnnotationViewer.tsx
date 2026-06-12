import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { TextLayer, AnnotationMode } from 'pdfjs-dist'
import { PDFDocument, PDFName, PDFArray, PDFNumber, PDFString, PDFDict, PDFHexString, rgb } from 'pdf-lib'
import 'pdfjs-dist/web/pdf_viewer.css'

type Tool = 'none' | 'highlight' | 'note'

interface Props {
  filePath: string
}

interface PendingNote {
  screenX: number
  screenY: number
  pdfX: number
  pdfY: number
  pageNum: number
}

// Write a /Highlight annotation directly into PDF bytes using pdf-lib low-level API.
// PDF coordinate system: origin bottom-left. rect = [x1, y1, x2, y2].
async function addHighlight(
  pdfBytes: Uint8Array,
  pageIndex: number,
  rect: [number, number, number, number]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes)
  const page = doc.getPage(pageIndex)
  const { context } = doc

  // QuadPoints: 8 numbers per quad = [x1,y2, x2,y2, x1,y1, x2,y1] (top-left going clockwise)
  const [x1, y1, x2, y2] = rect
  const quadPoints = [x1, y2, x2, y2, x1, y1, x2, y1]

  const annotDict = context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Highlight'),
    Rect: context.obj(rect),
    QuadPoints: context.obj(quadPoints),
    C: context.obj([1, 0.87, 0]),   // yellow in 0-1 range
    CA: PDFNumber.of(0.6),          // opacity
    F: PDFNumber.of(4),             // Print flag
    NM: PDFString.of(`hl-${Date.now()}`),
    M: PDFString.of(new Date().toISOString()),
    T: PDFString.of('RefNest'),
    Contents: PDFString.of(''),
  })

  const annotRef = context.register(annotDict)

  // Add to page's /Annots array
  const annotsRef = page.node.get(PDFName.of('Annots'))
  let annotsArray: PDFArray
  if (annotsRef instanceof PDFArray) {
    annotsArray = annotsRef
  } else if (annotsRef) {
    const resolved = doc.context.lookup(annotsRef)
    annotsArray = resolved instanceof PDFArray ? resolved : context.obj([])
  } else {
    annotsArray = context.obj([])
  }
  annotsArray.push(annotRef)
  page.node.set(PDFName.of('Annots'), annotsArray)

  return doc.save()
}

// Write a /Text (sticky note) annotation
async function addTextAnnotation(
  pdfBytes: Uint8Array,
  pageIndex: number,
  x: number,
  y: number,
  contents: string
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes)
  const page = doc.getPage(pageIndex)
  const { context } = doc

  const annotDict = context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Text'),
    Rect: context.obj([x, y, x + 20, y + 20]),
    Contents: PDFString.of(contents),
    T: PDFString.of('RefNest'),
    NM: PDFString.of(`note-${Date.now()}`),
    M: PDFString.of(new Date().toISOString()),
    F: PDFNumber.of(4),
    Open: PDFName.of('false'),
    Name: PDFName.of('Note'),
    C: context.obj([1, 0.82, 0]),
  })

  const annotRef = context.register(annotDict)

  const annotsRef = page.node.get(PDFName.of('Annots'))
  let annotsArray: PDFArray
  if (annotsRef instanceof PDFArray) {
    annotsArray = annotsRef
  } else if (annotsRef) {
    const resolved = doc.context.lookup(annotsRef)
    annotsArray = resolved instanceof PDFArray ? resolved : context.obj([])
  } else {
    annotsArray = context.obj([])
  }
  annotsArray.push(annotRef)
  page.node.set(PDFName.of('Annots'), annotsArray)

  return doc.save()
}

export function PdfAnnotationViewer({ filePath }: Props): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.5)
  const [tool, setTool] = useState<Tool>('none')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [pendingNote, setPendingNote] = useState<PendingNote | null>(null)

  const workerReadyRef = useRef(false)
  const pdfBytesRef = useRef<Uint8Array | null>(null)
  // The live pdfjs document — always reflects latest bytes
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null)
  const viewportsRef = useRef<Map<number, pdfjsLib.PageViewport>>(new Map())
  const scaleRef = useRef(scale)
  useEffect(() => { scaleRef.current = scale }, [scale])

  const initWorker = useCallback(async () => {
    if (workerReadyRef.current) return
    workerReadyRef.current = true
    const workerPath = await window.refnest.fs.pdfjsWorkerPath()
    const workerRaw = await window.refnest.fs.readFile(workerPath)
    const blob = new Blob([new Uint8Array(workerRaw)], { type: 'text/javascript' })
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob)
  }, [])

  // Render one page onto its canvas (with annotation layer)
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
    await page.render({
      canvasContext: canvas.getContext('2d')!,
      viewport,
      annotationMode: AnnotationMode.ENABLE,
    }).promise

    // TextLayer
    const wrapper = document.getElementById(`pdf-page-${pageNum}`)
    if (!wrapper) return
    wrapper.querySelector('.textLayer')?.remove()
    const textDiv = document.createElement('div')
    textDiv.className = 'textLayer'
    textDiv.style.width = `${viewport.width}px`
    textDiv.style.height = `${viewport.height}px`
    wrapper.appendChild(textDiv)
    const tl = new TextLayer({
      textContentSource: await page.getTextContent(),
      container: textDiv,
      viewport,
    })
    await tl.render()
  }, [])

  // Load bytes into a new PDFDocumentProxy, render all pages
  const loadAndRender = useCallback(async (bytes: Uint8Array) => {
    pdfBytesRef.current = bytes
    viewportsRef.current.clear()
    const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
    const old = pdfDocRef.current
    pdfDocRef.current = doc
    setNumPages(doc.numPages)
    // render all pages then destroy old doc
    for (let i = 1; i <= doc.numPages; i++) {
      await renderPage(doc, i, scaleRef.current)
    }
    old?.destroy()
  }, [renderPage])

  // Re-render only one page from new bytes (fast path after annotation)
  const rerenderOnePage = useCallback(async (pageNum: number, bytes: Uint8Array) => {
    pdfBytesRef.current = bytes
    const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
    const old = pdfDocRef.current
    pdfDocRef.current = doc
    await renderPage(doc, pageNum, scaleRef.current)
    old?.destroy()
  }, [renderPage])

  // Initial load
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    async function load(): Promise<void> {
      try {
        await initWorker()
        const raw = await window.refnest.fs.readFile(filePath)
        if (cancelled) return
        await loadAndRender(new Uint8Array(raw))
        if (!cancelled) setLoading(false)
      } catch (e) {
        if (!cancelled) { setError(String(e)); setLoading(false) }
      }
    }
    load()
    return () => { cancelled = true }
  }, [filePath, initWorker, loadAndRender])

  // Re-render all pages on scale change
  useEffect(() => {
    const doc = pdfDocRef.current
    if (!doc || loading) return
    viewportsRef.current.clear()
    let cancelled = false
    async function rerender(): Promise<void> {
      for (let i = 1; i <= doc!.numPages; i++) {
        if (cancelled) return
        await renderPage(doc!, i, scale)
      }
    }
    rerender()
    return () => { cancelled = true }
  }, [scale, loading, renderPage])

  function pageNumOfNode(node: Node | null): number | null {
    let el = node instanceof Element ? node : node?.parentElement
    while (el) {
      const p = (el as HTMLElement).dataset?.page
      if (p) return parseInt(p, 10)
      el = el.parentElement
    }
    return null
  }

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
    if (!viewport || !canvas || !pdfBytesRef.current) return
    const pdfRect = selectionToPdfRect(viewport, canvas, selRect)
    sel.removeAllRanges()

    setSaving(true)
    try {
      const newBytes = await addHighlight(pdfBytesRef.current, pageNum - 1, pdfRect)
      await window.refnest.fs.writeFile(filePath, Array.from(newBytes))
      await rerenderOnePage(pageNum, newBytes)
    } catch (err) {
      console.error('[PdfAnnotationViewer] highlight failed:', err)
    } finally {
      setSaving(false)
    }
  }, [tool, filePath, rerenderOnePage])

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
    if (!pendingNote || !pdfBytesRef.current) return
    setPendingNote(null)
    setSaving(true)
    try {
      const newBytes = await addTextAnnotation(
        pdfBytesRef.current,
        pendingNote.pageNum - 1,
        pendingNote.pdfX,
        pendingNote.pdfY,
        noteText
      )
      await window.refnest.fs.writeFile(filePath, Array.from(newBytes))
      await rerenderOnePage(pendingNote.pageNum, newBytes)
    } catch (err) {
      console.error('[PdfAnnotationViewer] note failed:', err)
    } finally {
      setSaving(false)
    }
  }, [pendingNote, noteText, filePath, rerenderOnePage])

  const btnStyle = (t: Tool): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: 6,
    border: '1px solid var(--border)',
    background: tool === t ? '#2563eb' : 'var(--surface)',
    color: tool === t ? '#fff' : 'var(--foreground-2)',
    fontSize: 12, fontWeight: 500, cursor: 'pointer', userSelect: 'none',
  })

  if (error) return (
    <div style={{ padding: 32, color: 'red', fontSize: 13 }}>PDF 加载失败：{error}</div>
  )

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
        {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
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
