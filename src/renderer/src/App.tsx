import { useEffect } from 'react'
import { MainLayout } from './components/layout/MainLayout'
import { useItemStore } from './stores/itemStore'
import './i18n'

export default function App(): JSX.Element {
  const { loadItems, selectedId, setSelectedId } = useItemStore()

  useEffect(() => {
    // Verify preload bridge is available
    if (!window.refnest) {
      console.error('[App] window.refnest is not defined — preload may have failed')
      return
    }
    loadItems()
  }, [loadItems])

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
    </div>
  )
}
