import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useItemStore } from '../../stores/itemStore'
import type { Item } from '../../../../shared/types'

type Tab = 'metadata' | 'attachments' | 'notes'

export function DetailPane({ itemId }: { itemId: number }): JSX.Element {
  const { t } = useTranslation('common')
  const { items, loadItems } = useItemStore()
  const [tab, setTab] = useState<Tab>('metadata')
  const [editing, setEditing] = useState<Partial<Item>>({})

  const item = items.find((i) => i.id === itemId)

  useEffect(() => {
    if (item) setEditing({ title: item.title ?? '', year: item.year ?? undefined, doi: item.doi ?? '' })
  }, [itemId])

  if (!item) return <div className="p-4 text-sm" style={{ color: 'var(--muted)' }}>...</div>

  const save = async (): Promise<void> => {
    await window.refnest.items.update(item.id, editing as Record<string, unknown>)
    await loadItems()
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'metadata', label: t('detail.tab.metadata') },
    { id: 'attachments', label: t('detail.tab.attachments') },
    { id: 'notes', label: t('detail.tab.notes') },
  ]

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Tab bar */}
      <div
        className="flex border-b shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className="px-3 py-2 text-xs font-medium border-b-2"
            style={{
              borderColor: tab === tb.id ? 'var(--primary)' : 'transparent',
              color: tab === tb.id ? 'var(--primary)' : 'var(--muted)',
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'metadata' && (
          <div className="space-y-3">
            <Field label={t('detail.title')}>
              <input
                className="w-full px-2 py-1 rounded border text-sm"
                style={{ border: '1px solid var(--border)', background: 'var(--background)' }}
                value={editing.title ?? ''}
                onChange={(e) => setEditing((p) => ({ ...p, title: e.target.value }))}
                onBlur={save}
              />
            </Field>
            <Field label={t('detail.type')}>
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--surface-hover)' }}>
                {item.type}
              </span>
            </Field>
            <Field label={t('detail.year')}>
              <input
                type="number"
                className="w-24 px-2 py-1 rounded border text-sm"
                style={{ border: '1px solid var(--border)', background: 'var(--background)' }}
                value={editing.year ?? ''}
                onChange={(e) => setEditing((p) => ({ ...p, year: Number(e.target.value) || undefined }))}
                onBlur={save}
              />
            </Field>
            <Field label="DOI">
              <input
                className="w-full px-2 py-1 rounded border text-sm font-mono"
                style={{ border: '1px solid var(--border)', background: 'var(--background)' }}
                value={editing.doi ?? ''}
                onChange={(e) => setEditing((p) => ({ ...p, doi: e.target.value }))}
                onBlur={save}
              />
            </Field>
          </div>
        )}

        {tab === 'attachments' && (
          <p style={{ color: 'var(--muted)' }}>{t('detail.attachmentsPlaceholder')}</p>
        )}

        {tab === 'notes' && (
          <p style={{ color: 'var(--muted)' }}>{t('detail.notesPlaceholder')}</p>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}
