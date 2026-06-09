import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useItemStore } from '../../stores/itemStore'
import { MetadataTab } from './MetadataTab'
import { TagsTab } from './TagsTab'
import type { Item } from '../../../../shared/types'

type Tab = 'metadata' | 'tags' | 'attachments' | 'notes'

export function DetailPane({ itemId }: { itemId: number }): JSX.Element {
  const { t } = useTranslation('common')
  const { items, loadItems } = useItemStore()
  const [tab, setTab] = useState<Tab>('metadata')

  const item = items.find((i) => i.id === itemId)

  const handleSaved = useCallback(() => loadItems(), [loadItems])

  useEffect(() => {
    setTab('metadata')
  }, [itemId])

  if (!item) {
    return <div className="p-4 text-sm" style={{ color: 'var(--muted)' }}>...</div>
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'metadata', label: t('detail.tab.metadata') },
    { id: 'tags', label: t('detail.tab.tags') },
    { id: 'attachments', label: t('detail.tab.attachments') },
    { id: 'notes', label: t('detail.tab.notes') },
  ]

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Tab bar */}
      <div
        className="flex border-b shrink-0 overflow-x-auto"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className="px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap"
            style={{
              borderColor: tab === tb.id ? 'var(--primary)' : 'transparent',
              color: tab === tb.id ? 'var(--primary)' : 'var(--muted)',
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'metadata' && <MetadataTab item={item} onSaved={handleSaved} />}
        {tab === 'tags' && <TagsTab itemId={item.id} />}
        {tab === 'attachments' && (
          <div className="p-4" style={{ color: 'var(--muted)' }}>
            {t('detail.attachmentsPlaceholder')}
          </div>
        )}
        {tab === 'notes' && (
          <div className="p-4" style={{ color: 'var(--muted)' }}>
            {t('detail.notesPlaceholder')}
          </div>
        )}
      </div>
    </div>
  )
}
