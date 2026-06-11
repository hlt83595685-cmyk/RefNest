import { useEffect, useState } from 'react'
import { MainLayout } from './components/layout/MainLayout'
import { Pdf2mdDialog } from './components/tools/Pdf2mdDialog'
import { useItemStore } from './stores/itemStore'
import { useStatusStore } from './stores/statusStore'
import './i18n'

export default function App(): JSX.Element {
  const { loadItems, selectedId, setSelectedId } = useItemStore()
  const { setStatus } = useStatusStore()
  const [showPdf2md, setShowPdf2md] = useState(false)

  useEffect(() => {
    // Verify preload bridge is available
    if (!window.refnest) {
      console.error('[App] window.refnest is not defined — preload may have failed')
      return
    }
    loadItems()
  }, [loadItems])

  // Listen for menu: 工具 > pdf2md settings
  useEffect(() => {
    const cleanup = window.electron.ipcRenderer.on('tool:open-settings', () => setShowPdf2md(true))
    return cleanup
  }, [])

  // Global pdf2md status feed
  useEffect(() => {
    window.refnest.onPdf2mdStatus((e) => setStatus(e))
    return () => window.refnest.offPdf2mdStatus()
  }, [setStatus])

  // Global Delete key — trash selected item
  useEffect(() => {
    const handler = async (e: KeyboardEvent): Promise<void> => {
      if (e.key !== 'Delete') return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (selectedId === null) return
      e.preventDefault()
      try {
        await window.refnest.items.trash(selectedId)
        setSelectedId(null)
        await loadItems()
      } catch (err) {
        console.error('[App] trash failed:', err)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedId, loadItems, setSelectedId])

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <MainLayout />
      {showPdf2md && <Pdf2mdDialog onClose={() => setShowPdf2md(false)} />}
    </div>
  )
}
