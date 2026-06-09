import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { MainLayout } from './components/layout/MainLayout'
import { useItemStore } from './stores/itemStore'

export default function App(): JSX.Element {
  const { i18n } = useTranslation()
  const loadItems = useItemStore((s) => s.loadItems)

  useEffect(() => {
    loadItems()
  }, [loadItems])

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background text-foreground">
      <MainLayout />
    </div>
  )
}
