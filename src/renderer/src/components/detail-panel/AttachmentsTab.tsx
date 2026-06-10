import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { Attachment } from '../../../../shared/types'
import { PdfViewer } from '../pdf-viewer/PdfViewer'

export function AttachmentsTab({ itemId }: { itemId: number }): JSX.Element {
  const { t } = useTranslation('common')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [viewingPath, setViewingPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    try {
      const list = await window.refnest.attachments.getByItem(itemId)
      setAttachments(list)
    } catch (err) {
      console.error('[AttachmentsTab] load failed:', err)
    }
  }, [itemId])

  useEffect(() => {
    setViewingPath(null)
    reload()
  }, [itemId, reload])

  const handleAdd = async (): Promise<void> => {
    setLoading(true)
    try {
      const att = await window.refnest.attachments.add(itemId)
      if (att) await reload()
    } catch (err) {
      console.error('[AttachmentsTab] add failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (id: number): Promise<void> => {
    try {
      await window.refnest.attachments.remove(id)
      if (viewingPath !== null) setViewingPath(null)
      await reload()
    } catch (err) {
      console.error('[AttachmentsTab] remove failed:', err)
    }
  }

  const handleOpen = async (att: Attachment): Promise<void> => {
    if (att.mime_type === 'application/pdf' || att.filename?.toLowerCase().endsWith('.pdf')) {
      const path = await window.refnest.attachments.getPath(att.id)
      if (path) setViewingPath(path)
    } else {
      await window.refnest.attachments.openExternal(att.id)
    }
  }

  const formatSize = (bytes: number | null): string => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (viewingPath) {
    return (
      <div className="flex flex-col h-full">
        <div
          className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <button
            onClick={() => setViewingPath(null)}
            className="text-xs px-2 py-1 rounded border"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            ← {t('attachments.backToList')}
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <PdfViewer filePath={viewingPath} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 flex items-center justify-between shrink-0">
        <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
          {attachments.length > 0
            ? t('attachments.count', { count: attachments.length })
            : t('attachments.empty')}
        </span>
        <button
          onClick={handleAdd}
          disabled={loading}
          className="text-xs px-2 py-1 rounded"
          style={{ background: 'var(--primary)', color: '#fff', opacity: loading ? 0.6 : 1 }}
        >
          + {t('attachments.add')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-1">
        {attachments.map((att) => (
          <div
            key={att.id}
            className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer group"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <span className="text-base select-none">
              {att.mime_type === 'application/pdf' ? '📄' : '📎'}
            </span>
            <div
              className="flex-1 min-w-0 cursor-pointer"
              onClick={() => handleOpen(att)}
            >
              <div className="text-xs truncate font-medium" style={{ color: 'var(--foreground)' }}>
                {att.filename ?? 'attachment'}
              </div>
              {att.size != null && (
                <div className="text-xs" style={{ color: 'var(--muted)' }}>
                  {formatSize(att.size)}
                </div>
              )}
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => window.refnest.attachments.openExternal(att.id)}
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
                title={t('attachments.openExternal')}
              >
                ↗
              </button>
              <button
                onClick={() => handleRemove(att.id)}
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ color: '#e53e3e', border: '1px solid var(--border)' }}
                title={t('attachments.remove')}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
