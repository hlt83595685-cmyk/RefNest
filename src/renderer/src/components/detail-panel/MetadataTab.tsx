import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Item, Creator, ItemType } from '../../../../shared/types'
import { ITEM_TYPE_LABELS } from '../../../../shared/types'

interface Props {
  item: Item
  onSaved: () => void
}

export function MetadataTab({ item, onSaved }: Props): JSX.Element {
  const { t, i18n } = useTranslation('common')
  const lang = i18n.language as 'zh' | 'en'

  const [fields, setFields] = useState<Partial<Item>>({})
  const [creators, setCreators] = useState<Creator[]>([])
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setFields({
      title: item.title ?? '',
      type: item.type,
      abstract: item.abstract ?? '',
      year: item.year ?? undefined,
      doi: item.doi ?? '',
      url: item.url ?? '',
      journal: item.journal ?? '',
      publisher: item.publisher ?? '',
      volume: item.volume ?? '',
      issue: item.issue ?? '',
      pages: item.pages ?? '',
      isbn: item.isbn ?? '',
      language: item.language ?? '',
    })
    setDirty(false)
    window.refnest.creators.getByItem(item.id).then(setCreators)
  }, [item.id])

  const set = (key: keyof Item, value: unknown): void => {
    setFields((p) => ({ ...p, [key]: value }))
    setDirty(true)
  }

  const save = async (): Promise<void> => {
    if (!dirty) return
    await window.refnest.items.update(item.id, fields as Record<string, unknown>)
    await window.refnest.creators.setForItem(item.id, creators)
    setDirty(false)
    onSaved()
  }

  const addCreator = (): void => {
    setCreators((prev) => [
      ...prev,
      { last_name: '', first_name: '', role: 'author', position: prev.length },
    ])
    setDirty(true)
  }

  const updateCreator = (index: number, field: keyof Creator, value: string): void => {
    setCreators((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    )
    setDirty(true)
  }

  const removeCreator = (index: number): void => {
    setCreators((prev) => prev.filter((_, i) => i !== index).map((c, i) => ({ ...c, position: i })))
    setDirty(true)
  }

  const itemTypes = Object.keys(ITEM_TYPE_LABELS) as ItemType[]

  return (
    <div className="p-4 space-y-4">
      {/* Save indicator */}
      {dirty && (
        <div className="flex justify-end">
          <button
            onClick={save}
            className="px-3 py-1 text-xs rounded font-medium"
            style={{ background: 'var(--primary)', color: '#fff' }}
          >
            {t('detail.save')}
          </button>
        </div>
      )}

      {/* Type */}
      <Field label={t('detail.type')}>
        <select
          className="w-full px-2 py-1.5 rounded border text-sm"
          style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
          value={fields.type ?? ''}
          onChange={(e) => set('type', e.target.value)}
          onBlur={save}
        >
          {itemTypes.map((t) => (
            <option key={t} value={t}>{ITEM_TYPE_LABELS[t][lang]}</option>
          ))}
        </select>
      </Field>

      {/* Title */}
      <Field label={t('detail.title')}>
        <input
          className="w-full px-2 py-1.5 rounded border text-sm"
          style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
          value={fields.title ?? ''}
          onChange={(e) => set('title', e.target.value)}
          onBlur={save}
        />
      </Field>

      {/* Authors */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
            {t('detail.authors')}
          </label>
          <button
            onClick={addCreator}
            className="text-xs px-2 py-0.5 rounded"
            style={{ color: 'var(--primary)', border: '1px solid var(--primary)' }}
          >
            + {t('detail.addAuthor')}
          </button>
        </div>
        <div className="space-y-1.5">
          {creators.map((c, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <input
                placeholder={t('detail.lastName')}
                className="flex-1 px-2 py-1 rounded border text-xs"
                style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                value={c.last_name}
                onChange={(e) => updateCreator(i, 'last_name', e.target.value)}
                onBlur={save}
              />
              <input
                placeholder={t('detail.firstName')}
                className="flex-1 px-2 py-1 rounded border text-xs"
                style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                value={c.first_name ?? ''}
                onChange={(e) => updateCreator(i, 'first_name', e.target.value)}
                onBlur={save}
              />
              <select
                className="px-1 py-1 rounded border text-xs"
                style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                value={c.role}
                onChange={(e) => updateCreator(i, 'role', e.target.value)}
                onBlur={save}
              >
                <option value="author">{t('detail.roleAuthor')}</option>
                <option value="editor">{t('detail.roleEditor')}</option>
                <option value="translator">{t('detail.roleTranslator')}</option>
              </select>
              <button
                onClick={() => removeCreator(i)}
                className="text-xs px-1.5 py-1 rounded"
                style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Year */}
      <Field label={t('detail.year')}>
        <input
          type="number"
          className="w-28 px-2 py-1.5 rounded border text-sm"
          style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
          value={fields.year ?? ''}
          onChange={(e) => set('year', e.target.value ? Number(e.target.value) : null)}
          onBlur={save}
        />
      </Field>

      {/* Journal / Publisher */}
      <Field label={t('detail.journal')}>
        <input
          className="w-full px-2 py-1.5 rounded border text-sm"
          style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
          value={fields.journal ?? ''}
          onChange={(e) => set('journal', e.target.value)}
          onBlur={save}
        />
      </Field>

      {/* Volume / Issue / Pages — inline row */}
      <div className="flex gap-2">
        <Field label={t('detail.volume')} className="flex-1">
          <input
            className="w-full px-2 py-1.5 rounded border text-sm"
            style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
            value={fields.volume ?? ''}
            onChange={(e) => set('volume', e.target.value)}
            onBlur={save}
          />
        </Field>
        <Field label={t('detail.issue')} className="flex-1">
          <input
            className="w-full px-2 py-1.5 rounded border text-sm"
            style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
            value={fields.issue ?? ''}
            onChange={(e) => set('issue', e.target.value)}
            onBlur={save}
          />
        </Field>
        <Field label={t('detail.pages')} className="flex-1">
          <input
            className="w-full px-2 py-1.5 rounded border text-sm"
            style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
            value={fields.pages ?? ''}
            onChange={(e) => set('pages', e.target.value)}
            onBlur={save}
          />
        </Field>
      </div>

      {/* Publisher */}
      <Field label={t('detail.publisher')}>
        <input
          className="w-full px-2 py-1.5 rounded border text-sm"
          style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
          value={fields.publisher ?? ''}
          onChange={(e) => set('publisher', e.target.value)}
          onBlur={save}
        />
      </Field>

      {/* DOI */}
      <Field label="DOI">
        <input
          className="w-full px-2 py-1.5 rounded border text-sm font-mono"
          style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
          value={fields.doi ?? ''}
          onChange={(e) => set('doi', e.target.value)}
          onBlur={save}
        />
      </Field>

      {/* URL */}
      <Field label="URL">
        <input
          type="url"
          className="w-full px-2 py-1.5 rounded border text-sm"
          style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
          value={fields.url ?? ''}
          onChange={(e) => set('url', e.target.value)}
          onBlur={save}
        />
      </Field>

      {/* Abstract */}
      <Field label={t('detail.abstract')}>
        <textarea
          rows={5}
          className="w-full px-2 py-1.5 rounded border text-sm resize-y"
          style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
          value={fields.abstract ?? ''}
          onChange={(e) => set('abstract', e.target.value)}
          onBlur={save}
        />
      </Field>
    </div>
  )
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string
  children: React.ReactNode
  className?: string
}): JSX.Element {
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}
