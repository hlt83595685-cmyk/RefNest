import { useTranslation } from 'react-i18next'
import { useItemStore } from '../../stores/itemStore'

const BUILT_IN_COLLECTIONS = [
  { id: 'all', labelKey: 'collections.all' },
  { id: 'recent', labelKey: 'collections.recent' },
  { id: 'trash', labelKey: 'collections.trash' },
]

export function CollectionPane(): JSX.Element {
  const { t } = useTranslation('common')
  const { activeCollection, setActiveCollection } = useItemStore()

  return (
    <div className="p-2">
      <p
        className="px-2 py-1 text-xs font-semibold uppercase tracking-wider"
        style={{ color: 'var(--muted)' }}
      >
        {t('collections.title')}
      </p>
      <ul className="mt-1 space-y-0.5">
        {BUILT_IN_COLLECTIONS.map((col) => (
          <li key={col.id}>
            <button
              onClick={() => setActiveCollection(col.id)}
              className="w-full text-left px-3 py-1.5 rounded text-sm"
              style={{
                background:
                  activeCollection === col.id ? 'var(--surface-hover)' : 'transparent',
                color: activeCollection === col.id ? 'var(--primary)' : 'var(--foreground)',
                fontWeight: activeCollection === col.id ? 600 : 400,
              }}
            >
              {t(col.labelKey)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
