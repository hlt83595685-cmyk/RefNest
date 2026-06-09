import { useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useItemStore } from '../../stores/itemStore'

export function Toolbar(): JSX.Element {
  const { t, i18n } = useTranslation('common')
  const { searchQuery, setSearchQuery, loadItems } = useItemStore()
  const searchRef = useRef<HTMLInputElement>(null)

  const toggleLang = (): void => {
    i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh')
  }

  const handleImport = async (): Promise<void> => {
    const result = await window.refnest.import.openDialog()
    if (!result.canceled && result.imported > 0) {
      await loadItems()
      alert(t('toolbar.importSuccess', { count: result.imported }))
    }
  }

  const handleAdd = async (): Promise<void> => {
    try {
      await window.refnest.items.create({ type: 'journalArticle', title: '新条目' })
      await loadItems()
    } catch (err) {
      console.error('[Toolbar] handleAdd failed:', err)
    }
  }

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      // Ctrl+N — new item
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        handleAdd()
      }
      // Ctrl+F — focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <header
      className="flex items-center gap-2 px-4 h-12 border-b shrink-0"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      <span className="font-bold text-base mr-2" style={{ color: 'var(--primary)' }}>
        RefNest
      </span>

      {/* Search */}
      <input
        ref={searchRef}
        type="search"
        placeholder={`${t('toolbar.search')}  Ctrl+F`}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-56 h-8 px-3 text-sm rounded border outline-none"
        style={{
          border: '1px solid var(--border)',
          background: 'var(--background)',
          color: 'var(--foreground)',
        }}
      />

      <div className="flex-1" />

      {/* Import */}
      <button
        onClick={handleImport}
        className="h-8 px-3 text-sm rounded border"
        style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
        title={t('toolbar.import')}
      >
        📥 {t('toolbar.import')}
      </button>

      {/* Add item */}
      <button
        onClick={handleAdd}
        className="h-8 px-3 text-sm rounded font-medium"
        style={{ background: 'var(--primary)', color: '#fff' }}
        title="Ctrl+N"
      >
        + {t('toolbar.addItem')}
      </button>

      {/* Language toggle */}
      <button
        onClick={toggleLang}
        className="h-8 px-3 text-sm rounded border"
        style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        title={t('toolbar.switchLang')}
      >
        {i18n.language === 'zh' ? 'EN' : '中'}
      </button>
    </header>
  )
}
