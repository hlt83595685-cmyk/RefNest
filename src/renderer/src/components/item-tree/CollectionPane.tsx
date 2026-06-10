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
    if (renamingId !== null && renameVal.trim()) await rename(renamingId, renameVal.trim())
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
    { id: 'all',    icon: '📚', label: t('collections.all') },
    { id: 'recent', icon: '🕒', label: t('collections.recent') },
    { id: 'trash',  icon: '🗑', label: t('collections.trash') },
  ]

  const navItem = (id: string, icon: string, label: string): JSX.Element => {
    const active = activeCollection === id
    return (
      <button
        key={id}
        onClick={() => setActiveCollection(id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '7px 12px',
          borderRadius: 'var(--radius-md)',
          border: 'none',
          background: active ? 'var(--primary-light)' : 'transparent',
          color: active ? 'var(--primary)' : 'var(--foreground-2)',
          fontWeight: active ? 600 : 400,
          fontSize: 13,
          textAlign: 'left',
          transition: 'background var(--duration) var(--ease)',
        }}
      >
        <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{icon}</span>
        {label}
      </button>
    )
  }

  return (
    <div style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Section label */}
      <p style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        padding: '0 12px',
        marginBottom: 6,
        userSelect: 'none',
      }}>
        {t('collections.title')}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {BUILT_IN.map(({ id, icon, label }) => navItem(id, icon, label))}
      </div>

      {/* My Collections */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px', marginTop: 20, marginBottom: 6,
      }}>
        <p style={{
          fontSize: 11, fontWeight: 600, color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em', userSelect: 'none',
        }}>
          {t('collections.myCollections')}
        </p>
        <button
          onClick={() => setAdding(true)}
          style={{
            width: 20, height: 20, borderRadius: '50%', border: 'none',
            background: 'var(--primary-light)', color: 'var(--primary)',
            fontSize: 14, fontWeight: 700, lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title={t('collections.new')}
        >
          +
        </button>
      </div>

      {adding && (
        <div style={{ padding: '0 4px', marginBottom: 4 }}>
          <input
            autoFocus
            placeholder={t('collections.namePlaceholder')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={onNewKey}
            onBlur={commitNew}
            style={{
              width: '100%', height: 30, padding: '0 10px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--primary)',
              background: 'var(--surface)',
              fontSize: 12,
            }}
          />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, overflowY: 'auto' }}>
        {collections.map((col) => {
          const active = activeCollection === `col:${col.id}`
          return (
            <div key={col.id} style={{ display: 'flex', alignItems: 'center', borderRadius: 'var(--radius-md)' }}
              className="group"
            >
              {renamingId === col.id ? (
                <input
                  autoFocus
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onKeyDown={onRenameKey}
                  onBlur={commitRename}
                  style={{
                    flex: 1, height: 30, padding: '0 10px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--primary)',
                    background: 'var(--surface)', fontSize: 12, margin: '0 4px',
                  }}
                />
              ) : (
                <>
                  <button
                    onClick={() => setActiveCollection(`col:${col.id}`)}
                    onDoubleClick={() => { setRenamingId(col.id); setRenameVal(col.name) }}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 12px',
                      borderRadius: 'var(--radius-md)', border: 'none',
                      background: active ? 'var(--primary-light)' : 'transparent',
                      color: active ? 'var(--primary)' : 'var(--foreground-2)',
                      fontWeight: active ? 600 : 400,
                      fontSize: 13, textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 13 }}>📁</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {col.name}
                    </span>
                  </button>
                  <button
                    onClick={() => remove(col.id)}
                    title={t('collections.delete')}
                    style={{
                      width: 20, height: 20, borderRadius: 4, border: 'none',
                      background: 'transparent', color: 'var(--muted)',
                      fontSize: 14, marginRight: 4,
                      opacity: 0,
                    }}
                    className="group-hover-visible"
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
