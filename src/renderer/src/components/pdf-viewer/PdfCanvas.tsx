import { useEffect, useRef, useState, useCallback } from 'react'
import type { Annotation } from '../../../../shared/types'

// pdfjs-dist v4+ uses ESM; we import the legacy build for Vite compat
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

// Point worker at the bundled file served by Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

export interface AnnotationCreatePayload {
  page: number
  type: 'highlight' | 'note'
  color: string
  text: string
  comment: string
  rects: Array<{ x: number; y: number; w: number; h: number }>
}

interface Props {
  filePath: string
  itemId: number
  annotations: Annotation[]
  activeColor: string
  onAnnotationCreate: (payload: AnnotationCreatePayload) => void
  onAnnotationDelete: (id: number) => void
  onAnnotationCommentEdit: (id: number, comment: string) => void
}

interface PageRenderState {
  pageNum: number
  rendered: boolean
}

const SCALE = 1.5

export function PdfCanvas({
  filePath, itemId, annotations, activeColor,
  onAnnotationCreate, onAnnotationDelete, onAnnotationCommentEdit,
}: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [pageStates, setPageStates] = useState<PageRenderState[]>([])
  // tooltip for annotation actions
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; annId: number; comment: string; editing: boolean
  } | null>(null)
  // selection toolbar
  const [selBar, setSelBar] = useState<{ x: number; y: number; page: number; text: string; rects: Array<{ x: number; y: number; w: number; h: number }> } | null>(null)

  // Load PDF
  useEffect(() => {
    const src = filePath.replace(/\\/g, '/').split('/').map((s) => encodeURIComponent(s)).join('/')
    const url = `refnest-file://${src}`
    let cancelled = false
    pdfjsLib.getDocument({ url }).promise.then((doc) => {
      if (cancelled) return
      setPdfDoc(doc)
      setNumPages(doc.numPages)
      setPageStates(Array.from({ length: doc.numPages }, (_, i) => ({ pageNum: i + 1, rendered: false })))
    }).catch((e) => console.error('[PdfCanvas] load failed', e))
    return () => { cancelled = true }
  }, [filePath])

  // Render a single page into its canvas
  const renderPage = useCallback(async (doc: PDFDocumentProxy, pageNum: number) => {
    const canvas = document.getElementById(`pdf-page-${pageNum}`) as HTMLCanvasElement | null
    if (!canvas) return
    const page: PDFPageProxy = await doc.getPage(pageNum)
    const viewport = page.getViewport({ scale: SCALE })
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport }).promise
    setPageStates((prev) => prev.map((p) => p.pageNum === pageNum ? { ...p, rendered: true } : p))
  }, [])

  // Render all pages when doc loaded
  useEffect(() => {
    if (!pdfDoc) return
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      renderPage(pdfDoc, i)
    }
  }, [pdfDoc, renderPage])

  // --- Selection handling ---
  const handleMouseUp = useCallback((e: React.MouseEvent, pageNum: number) => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) return
    const text = sel.toString().trim()
    if (!text) return

    const pageEl = document.getElementById(`pdf-page-wrapper-${pageNum}`)
    if (!pageEl) return
    const pageRect = pageEl.getBoundingClientRect()

    const range = sel.getRangeAt(0)
    const clientRects = Array.from(range.getClientRects())
    const rects = clientRects.map((r) => ({
      x: ((r.left - pageRect.left) / pageRect.width) * 100,
      y: ((r.top - pageRect.top) / pageRect.height) * 100,
      w: (r.width / pageRect.width) * 100,
      h: (r.height / pageRect.height) * 100,
    }))

    setSelBar({
      x: e.clientX,
      y: e.clientY - 44,
      page: pageNum,
      text,
      rects,
    })
    setTooltip(null)
  }, [])

  const commitHighlight = useCallback((comment = '') => {
    if (!selBar) return
    onAnnotationCreate({
      page: selBar.page,
      type: 'highlight',
      color: activeColor,
      text: selBar.text,
      comment,
      rects: selBar.rects,
    })
    window.getSelection()?.removeAllRanges()
    setSelBar(null)
  }, [selBar, activeColor, onAnnotationCreate])

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // dismiss tooltip / selbar on outside click
    if ((e.target as HTMLElement).closest('[data-ann-tooltip]')) return
    if ((e.target as HTMLElement).closest('[data-sel-bar]')) return
    setTooltip(null)
    setSelBar(null)
    window.getSelection()?.removeAllRanges()
  }, [])

  // --- Annotation rendering helpers ---
  const annsByPage = annotations.reduce<Record<number, Annotation[]>>((acc, a) => {
    ;(acc[a.page] ??= []).push(a)
    return acc
  }, {})

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflowY: 'auto', background: '#525659', padding: '16px 0', position: 'relative' }}
      onClick={handleContainerClick}
    >
      {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
        <div
          key={pageNum}
          style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}
        >
          <div
            id={`pdf-page-wrapper-${pageNum}`}
            style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}
          >
            {/* Canvas */}
            <canvas id={`pdf-page-${pageNum}`} style={{ display: 'block', boxShadow: '0 2px 12px rgba(0,0,0,0.4)' }} />

            {/* Text layer for selection — transparent overlay */}
            <div
              style={{
                position: 'absolute', inset: 0,
                cursor: 'text',
                userSelect: 'text',
              }}
              onMouseUp={(e) => handleMouseUp(e, pageNum)}
            />

            {/* Highlight rects */}
            {(annsByPage[pageNum] ?? []).map((ann) => {
              let rects: Array<{ x: number; y: number; w: number; h: number }> = []
              try { rects = JSON.parse(ann.rects) } catch { /* ignore */ }
              return rects.map((r, ri) => (
                <div
                  key={`${ann.id}-${ri}`}
                  data-ann-id={ann.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    setTooltip({ x: e.clientX, y: e.clientY - 60, annId: ann.id, comment: ann.comment, editing: false })
                    setSelBar(null)
                  }}
                  style={{
                    position: 'absolute',
                    left: `${r.x}%`, top: `${r.y}%`,
                    width: `${r.w}%`, height: `${r.h}%`,
                    background: ann.color + '55',
                    borderBottom: `2px solid ${ann.color}`,
                    cursor: 'pointer',
                    pointerEvents: 'all',
                  }}
                />
              ))
            })}
          </div>
        </div>
      ))}

      {/* Page counter */}
      {numPages > 0 && (
        <div style={{
          position: 'sticky', bottom: 8,
          display: 'flex', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{
            background: 'rgba(0,0,0,0.55)', color: '#fff',
            fontSize: 11, padding: '3px 10px', borderRadius: 10,
          }}>
            {numPages} pages
          </span>
        </div>
      )}

      {/* Selection toolbar */}
      {selBar && (
        <SelectionToolbar
          x={selBar.x} y={selBar.y}
          onHighlight={() => commitHighlight()}
          onNote={() => {
            const comment = prompt('添加批注（可留空）：') ?? ''
            commitHighlight(comment)
          }}
          onDismiss={() => { setSelBar(null); window.getSelection()?.removeAllRanges() }}
        />
      )}

      {/* Annotation tooltip */}
      {tooltip && (
        <AnnotationTooltip
          x={tooltip.x} y={tooltip.y}
          comment={tooltip.comment}
          editing={tooltip.editing}
          onEdit={() => setTooltip((t) => t ? { ...t, editing: true } : null)}
          onSave={(c) => { onAnnotationCommentEdit(tooltip.annId, c); setTooltip(null) }}
          onDelete={() => { onAnnotationDelete(tooltip.annId); setTooltip(null) }}
          onClose={() => setTooltip(null)}
        />
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SelectionToolbar({ x, y, onHighlight, onNote, onDismiss }: {
  x: number; y: number
  onHighlight: () => void
  onNote: () => void
  onDismiss: () => void
}): JSX.Element {
  return (
    <div
      data-sel-bar="1"
      style={{
        position: 'fixed', left: x, top: y, zIndex: 500,
        background: 'rgba(30,30,30,0.92)',
        backdropFilter: 'blur(8px)',
        borderRadius: 8, padding: '4px 6px',
        display: 'flex', gap: 4,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <ToolBtn label="高亮" emoji="🖊" color="#FFD60A" onClick={onHighlight} />
      <ToolBtn label="批注" emoji="💬" color="#34aadc" onClick={onNote} />
      <ToolBtn label="✕" emoji="" color="#888" onClick={onDismiss} />
    </div>
  )
}

function AnnotationTooltip({ x, y, comment, editing, onEdit, onSave, onDelete, onClose }: {
  x: number; y: number
  comment: string; editing: boolean
  onEdit: () => void
  onSave: (c: string) => void
  onDelete: () => void
  onClose: () => void
}): JSX.Element {
  const [draft, setDraft] = useState(comment)
  return (
    <div
      data-ann-tooltip="1"
      style={{
        position: 'fixed', left: x, top: y, zIndex: 500,
        background: 'rgba(255,255,255,0.97)',
        border: '1px solid var(--border)',
        borderRadius: 10, padding: '10px 12px',
        minWidth: 200, maxWidth: 280,
        boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {editing ? (
        <>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{
              width: '100%', minHeight: 64, resize: 'vertical',
              border: '1px solid var(--border)', borderRadius: 6,
              fontSize: 12, padding: '6px 8px', fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => onSave(draft)} style={tooltipBtnStyle('#007aff', '#fff')}>保存</button>
            <button onClick={onClose} style={tooltipBtnStyle('var(--border)', 'var(--foreground-2)')}>取消</button>
          </div>
        </>
      ) : (
        <>
          {comment && <p style={{ fontSize: 12, color: 'var(--foreground)', margin: 0 }}>{comment}</p>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onEdit} style={tooltipBtnStyle('#007aff', '#fff')}>
              {comment ? '编辑批注' : '添加批注'}
            </button>
            <button onClick={onDelete} style={tooltipBtnStyle('#ff3b30', '#fff')}>删除</button>
            <button onClick={onClose} style={tooltipBtnStyle('var(--border)', 'var(--foreground-2)')}>✕</button>
          </div>
        </>
      )}
    </div>
  )
}

function ToolBtn({ label, emoji, color, onClick }: { label: string; emoji: string; color: string; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        height: 28, padding: '0 10px', borderRadius: 6,
        border: 'none', background: 'transparent',
        color, fontSize: 13, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 4,
      }}
    >
      {emoji && <span>{emoji}</span>}
      <span style={{ fontSize: 11, color: '#ccc' }}>{emoji ? label : label}</span>
    </button>
  )
}

function tooltipBtnStyle(bg: string, color: string): React.CSSProperties {
  return {
    height: 26, padding: '0 10px', borderRadius: 6,
    border: `1px solid ${bg}`, background: bg,
    color, fontSize: 11, fontWeight: 500, cursor: 'pointer',
  }
}
