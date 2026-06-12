import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { TextLayer } from 'pdfjs-dist'
import { PDFDocument, PDFName, PDFArray, PDFNumber, PDFString } from 'pdf-lib'
import 'pdfjs-dist/web/pdf_viewer.css'

type Tool = 'none' | 'highlight' | 'note'

interface Props {
  filePath: string
}

// A highlight stored in React state for canvas overlay drawing
interface HighlightRect {
  id: string
  pageNum: number
  // PDF-space coordinates
  pdfRect: [number, number, number, number]
}

// A sticky note stored in React state for DOM overlay
interface NoteAnnot {
  id: string
  pageNum: number
  pdfX: number
  pdfY: number
  contents: string
}

interface PendingNote {
  screenX: number
  screenY: number
  pdfX: number
  pdfY: number
  pageNum: number
}

// ── PDF write helpers ────────────────────────────────────────────────────────

async function addHighlightToPdf(
  bytes: Uint8Array,
  pageIndex: number,
  rect: [number, number, number, number],
  id: string
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes)
  const page = doc.getPage(pageIndex)
  const [x1, y1, x2, y2] = rect
  const quadPoints = [x1, y2, x2, y2, x1, y1, x2, y1]

  const annot = doc.context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Highlight'),
    Rect: doc.context.obj([x1, y1, x2, y2]),
    QuadPoints: doc.context.obj(quadPoints),
    C: doc.context.obj([1, 0.87, 0]),
    CA: PDFNumber.of(0.5),
    F: PDFNumber.of(4),
    NM: PDFString.of(id),
    T: PDFString.of('RefNest'),
    Contents: PDFString.of(''),
  })
  const ref = doc.context.register(annot)
  pushAnnotRef(doc, page, ref)
  return doc.save()
}

async function addNoteToPdf(
  bytes: Uint8Array,
  pageIndex: number,
  x: number,
  y: number,
  contents: string,
  id: string
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes)
  const page = doc.getPage(pageIndex)

  const annot = doc.context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Text'),
    Rect: doc.context.obj([x, y, x + 20, y + 20]),
    Contents: PDFString.of(contents),
    T: PDFString.of('RefNest'),
    NM: PDFString.of(id),
    F: PDFNumber.of(4),
    Open: PDFName.of('false'),
    Name: PDFName.of('Note'),
    C: doc.context.obj([1, 0.87, 0]),
  })
  const ref = doc.context.register(annot)
  pushAnnotRef(doc, page, ref)
  return doc.save()
}

function pushAnnotRef(doc: PDFDocument, page: ReturnType<PDFDocument['getPage']>, ref: import('pdf-lib').PDFRef): void {
  const existing = page.node.get(PDFName.of('Annots'))
  let arr: PDFArray
  if (existing instanceof PDFArray) {
    arr = existing
  } else if (existing) {
    const resolved = doc.context.lookup(existing)
    arr = resolved instanceof PDFArray ? resolved : doc.context.obj([])
  } else {
    arr = doc.context.obj([])
  }
  arr.push(ref)
  page.node.set(PDFName.of('Annots'), arr)
}

// ── Component ────────────────────────────────────────────────────────────────

export function PdfAnnotationViewer({ filePath }: Props): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.5)
  const [tool, setTool] = useState<Tool>('none')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [highlights, setHighlights] = useState<HighlightRect[]>([])
  const [notes, setNotes] = useState<NoteAnnot[]>([])
  const [pendingNote, setPendingNote] = useState<PendingNote | null>(null)
  const [noteText, setNoteText] = useState('')
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)

  const workerReadyRef = useRef(false)
  const pdfBytesRef = useRef<Uint8Array | null>(null)
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null)
  const viewportsRef = useRef<Map<number, pdfjsLib.PageViewport>>(new Map())
  const scaleRef = useRef(scale)
  useEffect(() => { scaleRef.current = scale }, [scale])

  // ── helpers ──

  const initWorker = useCallback(async () => {
    if (workerReadyRef.current) return
    workerReadyRef.current = true
    const workerPath = await window.refnest.fs.pdfjsWorkerPath()
    const raw = await window.refnest.fs.readFile(workerPath)
    const blob = new Blob([new Uint8Array(raw)], { type: 'text/javascript' })
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob)
  }, [])

  // Draw highlight overlays on canvas via 2D context (no re-render needed)
  const drawHighlightsOnPage = useCallback((pageNum: number, hl: HighlightRect[], vp: pdfjsLib.PageViewport) => {
    const canvas = document.getElementById(`pdf-canvas-${pageNum}`) as HTMLCanvasElement | null
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = 0.4
    ctx.fillStyle = '#FFE014'
    for (const h of hl.filter(h => h.pageNum === pageNum)) {
      const [x1, y1, x2, y2] = h.pdfRect
      // PDF coords: origin bottom-left; canvas: origin top-left
      const [sx1, sy1] = vp.convertToViewportPoint(x1, y2)
      const [sx2, sy2] = vp.convertToViewportPoint(x2, y1)
      ctx.fillRect(sx1, sy1, sx2 - sx1, sy2 - sy1)
    }
    ctx.restore()
  }, [])

  // Render one page: canvas (PDF content only, no annotation layer) + TextLayer
  const renderPage = useCallback(async (
    doc: pdfjsLib.PDFDocumentProxy,
    pageNum: number,
    currentScale: number,
    currentHighlights: HighlightRect[]
  ) => {
    const page = await doc.getPage(pageNum)
    const viewport = page.getViewport({ scale: currentScale })
    viewportsRef.current.set(pageNum, viewport)

    const canvas = document.getElementById(`pdf-canvas-${pageNum}`) as HTMLCanvasElement | null
    if (!canvas) return
    canvas.width = viewport.width
    canvas.height = viewport.height

    // Render PDF content without annotation layer (we draw highlights manually)
    await page.render({
      canvasContext: canvas.getContext('2d')!,
      viewport,
      annotationMode: 0, // DISABLE — we overlay highlights ourselves
    }).promise

    // Draw stored highlights on top
    drawHighlightsOnPage(pageNum, currentHighlights, viewport)

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
  }, [drawHighlightsOnPage])

  // Load existing annotations from PDF into state
  const loadAnnotations = useCallback(async (doc: pdfjsLib.PDFDocumentProxy) => {
    const hls: HighlightRect[] = []
    const nts: NoteAnnot[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const annots = await page.getAnnotations()
      for (const a of annots) {
        if (a.subtype === 'Highlight' && a.rect) {
          hls.push({ id: a.id ?? `hl-${i}-${hls.length}`, pageNum: i, pdfRect: a.rect })
        } else if (a.subtype === 'Text' && a.rect) {
          nts.push({
            id: a.id ?? `note-${i}-${nts.length}`,
            pageNum: i,
            pdfX: a.rect[0],
            pdfY: a.rect[1],
            contents: a.contents ?? '',
          })
        }
      }
    }
    setHighlights(hls)
    setNotes(nts)
    return hls
  }, [])

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
        const bytes = new Uint8Array(raw)
        pdfBytesRef.current = bytes
        viewportsRef.current.clear()
        const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
        if (cancelled) return
        pdfDocRef.current = doc
        setNumPages(doc.numPages)
        const hls = await loadAnnotations(doc)
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) return
          await renderPage(doc, i, scaleRef.current, hls)
        }
        if (!cancelled) setLoading(false)
      } catch (e) {
        if (!cancelled) { setError(String(e)); setLoading(false) }
      }
    }
    load()
    return () => { cancelled = true }
  }, [filePath, initWorker, loadAnnotations, renderPage])

  // Re-render all pages on scale change (uses current highlights from state via ref)
  const highlightsRef = useRef<HighlightRect[]>([])
  useEffect(() => { highlightsRef.current = highlights }, [highlights])

  useEffect(() => {
    const doc = pdfDocRef.current
    if (!doc || loading) return
    viewportsRef.current.clear()
    let cancelled = false
    async function rerender(): Promise<void> {
      for (let i = 1; i <= doc!.numPages; i++) {
        if (cancelled) return
        await renderPage(doc!, i, scale, highlightsRef.current)
      }
    }
    rerender()
    return () => { cancelled = true }
  }, [scale, loading, renderPage])

  // ── event handlers ──

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

    const id = `hl-${Date.now()}`
    const newHl: HighlightRect = { id, pageNum, pdfRect }

    // 1. Immediately draw on canvas — no re-render, no flicker
    drawHighlightsOnPage(pageNum, [newHl], viewport)
    setHighlights(prev => [...prev, newHl])

    // 2. Persist to PDF in background
    setSaving(true)
    try {
      const newBytes = await addHighlightToPdf(pdfBytesRef.current, pageNum - 1, pdfRect, id)
      await window.refnest.fs.writeFile(filePath, Array.from(newBytes))
      pdfBytesRef.current = newBytes
      // Update pdfDoc reference silently (for next annotation parse), no re-render
      const newDoc = await pdfjsLib.getDocument({ data: newBytes.slice() }).promise
      pdfDocRef.current?.destroy()
      pdfDocRef.current = newDoc
    } catch (err) {
      console.error('[PdfAnnotationViewer] highlight save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [tool, filePath, drawHighlightsOnPage])

  const handlePageClick = useCallback((e: React.MouseEvent, pageNum: number) => {
    if (tool !== 'note') return
    // Don't open note placement if clicking on an existing note icon
    const target = e.target as HTMLElement
    if (target.closest('[data-note-icon]')) return
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
    const { pageNum, pdfX, pdfY } = pendingNote
    setPendingNote(null)

    const id = `note-${Date.now()}`
    const newNote: NoteAnnot = { id, pageNum, pdfX, pdfY, contents: noteText }

    // 1. Add to state immediately — icon appears without waiting for disk write
    setNotes(prev => [...prev, newNote])

    // 2. Persist to PDF
    setSaving(true)
    try {
      const newBytes = await addNoteToPdf(pdfBytesRef.current, pageNum - 1, pdfX, pdfY, noteText, id)
      await window.refnest.fs.writeFile(filePath, Array.from(newBytes))
      pdfBytesRef.current = newBytes
      const newDoc = await pdfjsLib.getDocument({ data: newBytes.slice() }).promise
      pdfDocRef.current?.destroy()
      pdfDocRef.current = newDoc
    } catch (err) {
      console.error('[PdfAnnotationViewer] note save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [pendingNote, noteText, filePath])

  // Convert PDF coordinates to canvas screen position for note icon placement
  function noteIconPos(note: NoteAnnot): { left: number; top: number } | null {
    const viewport = viewportsRef.current.get(note.pageNum)
    if (!viewport) return null
    const canvas = document.getElementById(`pdf-canvas-${note.pageNum}`) as HTMLCanvasElement | null
    if (!canvas) return null
    const cr = canvas.getBoundingClientRect()
    const wrapper = document.getElementById(`pdf-page-${note.pageNum}`)
    if (!wrapper) return null
    const wr = wrapper.getBoundingClientRect()
    const [sx, sy] = viewport.convertToViewportPoint(note.pdfX, note.pdfY)
    // Position relative to wrapper (which is position:relative)
    return { left: sx + (cr.left - wr.left), top: sy + (cr.top - wr.top) }
  }

  // ── styles ──

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
              {/* Note icons overlaid on each page */}
              {notes.filter(n => n.pageNum === pageNum).map(note => {
                const pos = noteIconPos(note)
                if (!pos) return null
                const isOpen = openNoteId === note.id
                return (
                  <div key={note.id} style={{ position: 'absolute', left: pos.left, top: pos.top, zIndex: 10 }}>
                    {/* Icon */}
                    <div
                      data-note-icon="1"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenNoteId(isOpen ? null : note.id)
                      }}
                      style={{
                        width: 22, height: 22,
                        background: '#FFD700',
                        border: '1.5px solid #B8960C',
                        borderRadius: '4px 4px 0 4px',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                      }}
                      title={note.contents}
                    >
                      📝
                    </div>
                    {/* Popup */}
                    {isOpen && (
                      <div
                        onClick={e => e.stopPropagation()}
                        style={{
                          position: 'absolute', left: 24, top: 0,
                          minWidth: 200, maxWidth: 280,
                          background: '#FFFDE7',
                          border: '1px solid #B8960C',
                          borderRadius: '0 6px 6px 6px',
                          padding: '8px 10px',
                          fontSize: 12, lineHeight: 1.5,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          zIndex: 20,
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 4, color: '#7a6000' }}>便签</div>
                        <div>{note.contents || <span style={{ color: '#aaa' }}>（无内容）</span>}</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Note input popup */}
      {pendingNote && (
        <div style={{
          position: 'fixed',
          left: Math.min(pendingNote.screenX + 12, window.innerWidth - 260),
          top: Math.min(pendingNote.screenY + 12, window.innerHeight - 170),
          zIndex: 1000,
          background: '#FFFDE7',
          border: '1px solid #B8960C',
          borderRadius: 8, padding: 12,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          display: 'flex', flexDirection: 'column', gap: 8, minWidth: 230,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#7a6000' }}>添加便签</span>
          <textarea
            autoFocus
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) confirmNote() }}
            rows={3}
            style={{
              resize: 'none', fontSize: 13, padding: '4px 6px',
              border: '1px solid #B8960C', borderRadius: 4,
              background: '#fff',
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
