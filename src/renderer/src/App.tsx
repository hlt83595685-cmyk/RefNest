import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MainLayout } from './components/layout/MainLayout'
import { SettingsDialog } from './components/tools/SettingsDialog'
import { ToolsDialog } from './components/tools/ToolsDialog'
import { useItemStore } from './stores/itemStore'
import { useStatusStore } from './stores/statusStore'
import './i18n'

export default function App(): JSX.Element {
  const { loadItems, selectedId, setSelectedId } = useItemStore()
  const { setStatus } = useStatusStore()
  const { i18n } = useTranslation('common')
  const [settingsTab, setSettingsTab] = useState<string | null>(null)
  const [toolsTab, setToolsTab] = useState<string | null>(null)

  useEffect(() => {
    if (!window.refnest) {
      console.error('[App] window.refnest is not defined — preload may have failed')
      return
    }
    loadItems()
  }, [loadItems])

  // Menu → open tools dialog
  useEffect(() => {
    window.refnest.onToolsOpen((tab) => setToolsTab(tab))
    return () => window.refnest.offToolsOpen()
  }, [])

  // Menu → open settings dialog
  useEffect(() => {
    window.refnest.onSettingsOpen((tab) => setSettingsTab(tab))
    return () => window.refnest.offSettingsOpen()
  }, [])

  // Menu → language change (menu radio clicked)
  useEffect(() => {
    window.refnest.onSetLocale((locale) => { i18n.changeLanguage(locale) })
    return () => window.refnest.offSetLocale()
  }, [i18n])

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
      {toolsTab !== null && (
        <ToolsDialog
          initialTab={toolsTab}
          onClose={() => setToolsTab(null)}
        />
      )}
      {settingsTab !== null && (
        <SettingsDialog
          initialTab={settingsTab}
          onClose={() => setSettingsTab(null)}
        />
      )}
    </div>
  )
}
