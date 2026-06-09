import { useTranslation } from 'react-i18next'
import { useItemStore } from '../../stores/itemStore'

export function Toolbar(): JSX.Element {
  const { t, i18n } = useTranslation('common')
  const { searchQuery, setSearchQuery, loadItems } = useItemStore()

  const toggleLang = (): void => {
    i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh')
  }

  return (
    <header
      className="flex items-center gap-3 px-4 h-12 border-b shrink-0"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      {/* App name */}
      <span className="font-bold text-base" style={{ color: 'var(--primary)' }}>
        RefNest
      </span>

      <div className="flex-1" />

      {/* Search */}
      <input
        type="search"
        placeholder={t('toolbar.search')}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-64 h-8 px-3 text-sm rounded border outline-none"
        style={{
          border: '1px solid var(--border)',
          background: 'var(--background)',
          color: 'var(--foreground)',
        }}
      />

      {/* Add item */}
      <button
        onClick={() => window.refnest.items.create({ type: 'journalArticle', title: '' }).then(() => loadItems())}
        className="h-8 px-3 text-sm rounded font-medium"
        style={{ background: 'var(--primary)', color: '#fff' }}
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
