import { useTranslation } from 'react-i18next'
import { useItemStore } from '../../stores/itemStore'

export function PdfReaderPane(): JSX.Element {
  const { t } = useTranslation('common')
  const { viewerPath, viewerFilename, closePdf } = useItemStore()

  if (!viewerPath) return <></>

  const encoded = viewerPath
    .replace(/\\/g, '/')
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
  const src = `refnest-file://${encoded}`

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Reader toolbar */}
      <div
        className="flex items-center gap-3 px-4 h-10 shrink-0 border-b"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <button
          onClick={closePdf}
          className="text-xs px-2 py-1 rounded border"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          title={t('pdf.close')}
        >
          ← {t('pdf.backToList')}
        </button>
        <span
          className="text-sm truncate flex-1 font-medium"
          style={{ color: 'var(--foreground)' }}
          title={viewerFilename ?? ''}
        >
          📄 {viewerFilename}
        </span>
        <button
          onClick={() => window.refnest.attachments.openPath(viewerPath)}
          className="text-xs px-2 py-1 rounded border"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          title={t('attachments.openExternal')}
        >
          ↗ {t('pdf.openExternal')}
        </button>
      </div>

      {/* PDF iframe — takes all remaining space */}
      <div className="flex-1 overflow-hidden">
        <iframe
          src={src}
          className="w-full h-full border-0"
          title="PDF Viewer"
          style={{ display: 'block' }}
        />
      </div>
    </div>
  )
}
