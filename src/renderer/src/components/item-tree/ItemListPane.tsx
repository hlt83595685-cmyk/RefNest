import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useItemStore } from '../../stores/itemStore'
import type { Item } from '../../../../shared/types'

interface ContextMenu {
  x: number
  y: number
  itemId: number
}

function ItemRow({
  item,
  selected,
  onClick,
  onContextMenu,
}: {
  item: Item
  selected: boolean
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}): JSX.Element {
  const { t } = useTranslation('common')
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="flex flex-col px-4 py-2.5 cursor-pointer border-b select-none"
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
  const { items, selectedId, setSelectedId, searchQuery, activeCollection, loadItems } =
    useItemStore()
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const filtered = (() => {
    let list = activeCollection === 'trash'
      ? [] // trash is loaded separately, placeholder
      : items

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (i) =>
          i.title?.toLowerCase().includes(q) ||
          i.abstract?.toLowerCase().includes(q)
      )
    }
    return list
  })()

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleContextMenu = (e: React.MouseEvent, itemId: number): void => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, itemId })
  }

  const handleTrash = async (id: number): Promise<void> => {
    await window.refnest.items.trash(id)
    if (selectedId === id) setSelectedId(null)
    await loadItems()
    setContextMenu(null)
  }

  return (
    <div className="flex flex-col h-full" onClick={() => setContextMenu(null)}>
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
          <div
            className="flex flex-col items-center justify-center h-full gap-2"
            style={{ color: 'var(--muted)' }}
          >
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
              onContextMenu={(e) => handleContextMenu(e, item.id)}
            />
          ))
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 rounded shadow-lg py-1 text-sm min-w-36"
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <button
            className="w-full text-left px-4 py-1.5 hover:opacity-80"
            style={{ color: 'var(--accent)' }}
            onClick={() => handleTrash(contextMenu.itemId)}
          >
            🗑 {t('item.moveToTrash')}
          </button>
        </div>
      )}
    </div>
  )
}
