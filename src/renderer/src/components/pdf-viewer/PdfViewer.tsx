interface PdfViewerProps {
  filePath: string
}

export function PdfViewer({ filePath }: PdfViewerProps): JSX.Element {
  // Convert Windows absolute path to a file:// URL safe for Chromium
  const fileUrl = `file:///${filePath.replace(/\\/g, '/')}`

  return (
    <iframe
      src={fileUrl}
      className="w-full h-full border-0"
      title="PDF Viewer"
      style={{ display: 'block' }}
    />
  )
}
