import { useTranslation } from 'react-i18next'
import { useItemStore } from '../../stores/itemStore'
import type { Item } from '../../../../shared/types'

function ItemRow({ item, selected, onClick }: { item: Item; selected: boolean; onClick: () => void }): JSX.Element {
  const { t } = useTranslation('common')
  return (
    <div
      onClick={onClick}
      className="flex flex-col px-4 py-2.5 cursor-pointer border-b"
      style={{
        background: selected ? 'var(--surface-hover)' : 'transparent',
        borderColor: 'var(--border)',
        borderLeft: selected ? '3px solid var(--primary)' : '3px solid transparent',
      }}
    >
      <span className="font-medium text-sm truncate" style={{ color: 'var(--foreground)' }}>
        {item.title || t('item.untitled')}
      </span>
      <span className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
        {item.type} {item.year ? `· ${item.year}` : ''}
      </span>
    </div>
  )
}

export function ItemListPane(): JSX.Element {
  const { t } = useTranslation('common')
  const { items, selectedId, setSelectedId, searchQuery } = useItemStore()

  const filtered = searchQuery
    ? items.filter(
        (i) =>
          i.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          i.abstract?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : items

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center px-4 h-9 border-b text-xs font-semibold"
        style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--surface)' }}
      >
        <span>{t('item.listHeader', { count: filtered.length })}</span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--muted)' }}>
            <span className="text-2xl">📚</span>
            <p className="text-sm">{t('item.empty')}</p>
          </div>
        ) : (
          filtered.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              selected={selectedId === item.id}
              onClick={() => setSelectedId(item.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
