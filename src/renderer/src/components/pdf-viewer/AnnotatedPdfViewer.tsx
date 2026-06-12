import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { PdfCanvas, type AnnotationCreatePayload } from './PdfCanvas'
import type { Annotation } from '../../../../shared/types'

const HIGHLIGHT_COLORS = [
  { hex: '#FFD60A', label: '黄色' },
  { hex: '#30D158', label: '绿色' },
  { hex: '#FF375F', label: '红色' },
  { hex: '#0A84FF', label: '蓝色' },
]

interface Props {
  filePath: string
  itemId: number
}

export function AnnotatedPdfViewer({ filePath, itemId }: Props): JSX.Element {
  const { t } = useTranslation('common')
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [activeColor, setActiveColor] = useState(HIGHLIGHT_COLORS[0].hex)

  const reload = useCallback(async () => {
    const anns = await window.refnest.annotations.getByItem(itemId)
    setAnnotations(anns)
  }, [itemId])

  useEffect(() => { reload() }, [reload])

  const handleCreate = useCallback(async (payload: AnnotationCreatePayload) => {
    const ann = await window.refnest.annotations.create(
      itemId,
      payload.page,
      payload.type,
      payload.color,
      payload.text,
      payload.comment,
      JSON.stringify(payload.rects)
    )
    setAnnotations((prev) => [...prev, ann])

    // Sync to notes: append a blockquote entry
    await syncAnnotationToNote(itemId, ann.page, ann.text, ann.comment)
  }, [itemId])

  const handleDelete = useCallback(async (id: number) => {
    await window.refnest.annotations.delete(id)
    setAnnotations((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const handleCommentEdit = useCallback(async (id: number, comment: string) => {
    await window.refnest.annotations.updateComment(id, comment)
    setAnnotations((prev) => prev.map((a) => a.id === id ? { ...a, comment } : a))
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Annotation toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 12px', height: 38, flexShrink: 0,
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--separator)',
      }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.04em' }}>
          {t('pdf.highlightColor')}
        </span>
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c.hex}
            title={c.label}
            onClick={() => setActiveColor(c.hex)}
            style={{
              width: 18, height: 18, borderRadius: '50%',
              background: c.hex, border: 'none', cursor: 'pointer',
              outline: activeColor === c.hex ? `2px solid ${c.hex}` : 'none',
              outlineOffset: 2,
            }}
          />
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {annotations.length} {t('pdf.annotationCount')}
        </span>
      </div>

      <PdfCanvas
        filePath={filePath}
        itemId={itemId}
        annotations={annotations}
        activeColor={activeColor}
        onAnnotationCreate={handleCreate}
        onAnnotationDelete={handleDelete}
        onAnnotationCommentEdit={handleCommentEdit}
      />
    </div>
  )
}

// Append annotation quote to the first note of the item (or create a new one)
async function syncAnnotationToNote(
  itemId: number, page: number, text: string, comment: string
): Promise<void> {
  try {
    const notes = await window.refnest.notes.getByItem(itemId)
    const quote = `> ${text}\n> *(第 ${page} 页)*${comment ? `\n\n${comment}` : ''}`
    if (notes.length === 0) {
      await window.refnest.notes.create(itemId, quote)
    } else {
      const first = notes[0]
      const updated = first.content ? `${first.content}\n\n---\n\n${quote}` : quote
      await window.refnest.notes.update(first.id, updated)
    }
  } catch (e) {
    console.error('[AnnotatedPdfViewer] syncAnnotationToNote failed', e)
  }
}
