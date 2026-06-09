import { useEffect, useState, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Tag } from '../../../../shared/types'

export function TagsTab({ itemId }: { itemId: number }): JSX.Element {
  const { t } = useTranslation('common')
  const [tags, setTags] = useState<Tag[]>([])
  const [input, setInput] = useState('')

  useEffect(() => {
    window.refnest.tags.getByItem(itemId).then(setTags)
  }, [itemId])

  const commit = async (newTags: Tag[]): Promise<void> => {
    await window.refnest.tags.setForItem(itemId, newTags.map((t) => t.name))
    setTags(newTags)
  }

  const addTag = async (): Promise<void> => {
    const name = input.trim()
    if (!name || tags.some((t) => t.name === name)) return
    const next = [...tags, { id: 0, name }]
    await commit(next)
    setInput('')
  }

  const removeTag = async (name: string): Promise<void> => {
    await commit(tags.filter((t) => t.name !== name))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') { e.preventDefault(); addTag() }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <input
          className="flex-1 px-2 py-1.5 rounded border text-sm"
          style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
          placeholder={t('detail.tagPlaceholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          onClick={addTag}
          className="px-3 py-1.5 text-sm rounded font-medium"
          style={{ background: 'var(--primary)', color: '#fff' }}
        >
          {t('detail.addTag')}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag.name}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
            style={{ background: 'var(--primary)', color: '#fff' }}
          >
            {tag.name}
            <button
              onClick={() => removeTag(tag.name)}
              className="ml-0.5 opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 && (
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            {t('detail.noTags')}
          </span>
        )}
      </div>
    </div>
  )
}
