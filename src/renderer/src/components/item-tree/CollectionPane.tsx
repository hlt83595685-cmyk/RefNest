import { useEffect, useState, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useItemStore } from '../../stores/itemStore'
import { useCollectionStore } from '../../stores/collectionStore'

export function CollectionPane(): JSX.Element {
  const { t } = useTranslation('common')
  const { activeCollection, setActiveCollection } = useItemStore()
  const { collections, load, create, rename, remove } = useCollectionStore()
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameVal, setRenameVal] = useState('')

  useEffect(() => { load() }, [load])

  const commitNew = async (): Promise<void> => {
    const n = newName.trim()
    if (n) await create(n)
    setNewName(''); setAdding(false)
  }

  const commitRename = async (): Promise<void> => {
    if (renamingId !== null && renameVal.trim()) {
      await rename(renamingId, renameVal.trim())
    }
    setRenamingId(null)
  }

  const onNewKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter') commitNew()
    if (e.key === 'Escape') { setAdding(false); setNewName('') }
  }

  const onRenameKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') setRenamingId(null)
  }

  const BUILT_IN = [
    { id: 'all', label: t('collections.all') },
    { id: 'recent', label: t('collections.recent') },
    { id: 'trash', label: t('collections.trash') },
  ]

  return (
    <div className="p-2 h-full flex flex-col">
      {/* Built-in */}
      <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
        {t('collections.title')}
      </p>
      <ul className="mt-1 space-y-0.5">
        {BUILT_IN.map((col) => (
          <li key={col.id}>
            <button
              onClick={() => setActiveCollection(col.id)}
              className="w-full text-left px-3 py-1.5 rounded text-sm"
              style={{
                background: activeCollection === col.id ? 'var(--surface-hover)' : 'transparent',
                color: activeCollection === col.id ? 'var(--primary)' : 'var(--foreground)',
                fontWeight: activeCollection === col.id ? 600 : 400,
              }}
            >
              {col.id === 'all' ? '📚 ' : col.id === 'recent' ? '🕒 ' : '🗑 '}
              {col.label}
            </button>
          </li>
        ))}
      </ul>

      {/* User collections */}
      <div className="flex items-center justify-between px-2 mt-4 mb-1">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          {t('collections.myCollections')}
        </p>
        <button
          onClick={() => setAdding(true)}
          className="text-xs"
          style={{ color: 'var(--primary)' }}
          title={t('collections.new')}
        >
          +
        </button>
      </div>

      {adding && (
        <div className="px-2 mb-1">
          <input
            autoFocus
            className="w-full px-2 py-1 rounded border text-sm"
            style={{ border: '1px solid var(--primary)', background: 'var(--background)', color: 'var(--foreground)' }}
            placeholder={t('collections.namePlaceholder')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={onNewKey}
            onBlur={commitNew}
          />
        </div>
      )}

      <ul className="space-y-0.5 flex-1 overflow-y-auto">
        {collections.map((col) => (
          <li key={col.id} className="group flex items-center">
            {renamingId === col.id ? (
              <input
                autoFocus
                className="flex-1 mx-1 px-2 py-1 rounded border text-sm"
                style={{ border: '1px solid var(--primary)', background: 'var(--background)', color: 'var(--foreground)' }}
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onKeyDown={onRenameKey}
                onBlur={commitRename}
              />
            ) : (
              <>
                <button
                  onClick={() => setActiveCollection(`col:${col.id}`)}
                  className="flex-1 text-left px-3 py-1.5 rounded text-sm truncate"
                  style={{
                    background: activeCollection === `col:${col.id}` ? 'var(--surface-hover)' : 'transparent',
                    color: activeCollection === `col:${col.id}` ? 'var(--primary)' : 'var(--foreground)',
                  }}
                  onDoubleClick={() => { setRenamingId(col.id); setRenameVal(col.name) }}
                >
                  📁 {col.name}
                </button>
                <button
                  className="hidden group-hover:block px-1 text-xs"
                  style={{ color: 'var(--muted)' }}
                  onClick={() => remove(col.id)}
                  title={t('collections.delete')}
                >
                  ×
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
