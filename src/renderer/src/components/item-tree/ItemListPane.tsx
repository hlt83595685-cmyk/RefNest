import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useItemStore } from '../../stores/itemStore'
import type { Item } from '../../../../shared/types'

interface ContextMenu { x: number; y: number; itemId: number }

const TYPE_ICON: Record<string, string> = {
  journalArticle:  '📄',
  book:            '📗',
  bookSection:     '📖',
  thesis:          '🎓',
  conferencePaper: '🎤',
  report:          '📋',
  webpage:         '🌐',
  preprint:        '📝',
}

function ItemRow({ item, selected, onClick, onDoubleClick, onContextMenu }: {
  item: Item
  selected: boolean
  onClick: () => void
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}): JSX.Element {
  const { t } = useTranslation('common')
  const icon = TYPE_ICON[item.type] ?? '📄'

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 14px',
        cursor: 'pointer',
        borderBottom: '1px solid var(--separator)',
        background: selected ? 'var(--primary-light)' : 'transparent',
        borderLeft: `3px solid ${selected ? 'var(--primary)' : 'transparent'}`,
        transition: 'background var(--duration) var(--ease)',
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 18, marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 13,
          fontWeight: selected ? 600 : 500,
          color: selected ? 'var(--primary)' : 'var(--foreground)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: 1.4,
        }}>
          {item.title || t('item.untitled')}
        </p>
        <p style={{
          fontSize: 11,
          color: 'var(--muted)',
          marginTop: 2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {[item.journal, item.year].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  )
}

export function ItemListPane(): JSX.Element {
  const { t } = useTranslation('common')
  const { items, selectedId, setSelectedId, searchQuery, activeCollection, loadItems } = useItemStore()
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const isTrash = activeCollection === 'trash'

  const filtered = (() => {
    let list = items
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (i) => i.title?.toLowerCase().includes(q) || i.abstract?.toLowerCase().includes(q)
      )
    }
    return list
  })()

  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleDoubleClick = async (item: Item): Promise<void> => {
    setSelectedId(item.id)
    try {
      const atts = await window.refnest.attachments.getByItem(item.id)
      const pdf = atts.find(
        (a) => a.mime_type === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf')
      )
      if (!pdf) return
      const path = await window.refnest.attachments.getPath(pdf.id)
      if (path) useItemStore.getState().openPdf(path, pdf.filename ?? 'document.pdf')
    } catch (err) {
      console.error('[ItemListPane] double-click open failed:', err)
    }
  }

  const handleTrash = async (id: number): Promise<void> => {
    await window.refnest.items.trash(id)
    if (selectedId === id) setSelectedId(null)
    await loadItems()
    setContextMenu(null)
  }

  const handleRestore = async (id: number): Promise<void> => {
    await window.refnest.items.restore(id)
    if (selectedId === id) setSelectedId(null)
    await loadItems()
    setContextMenu(null)
  }

  const handleDeletePermanently = async (id: number): Promise<void> => {
    await window.refnest.items.delete(id)
    if (selectedId === id) setSelectedId(null)
    await loadItems()
    setContextMenu(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      onClick={() => setContextMenu(null)}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '0 14px', height: 36,
        borderBottom: '1px solid var(--separator)',
        background: 'var(--bg-elevated)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.04em' }}>
          {t('item.listHeader', { count: filtered.length })}
        </span>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: 10,
            color: 'var(--muted)',
          }}>
            <span style={{ fontSize: 36 }}>📚</span>
            <p style={{ fontSize: 13 }}>{t('item.empty')}</p>
          </div>
        ) : (
          filtered.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              selected={selectedId === item.id}
              onClick={() => setSelectedId(item.id)}
              onDoubleClick={() => handleDoubleClick(item)}
              onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, itemId: item.id }) }}
            />
          ))
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 100,
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg)',
            padding: '4px',
            minWidth: 160,
          }}
        >
          {isTrash ? (
            <>
              <ContextItem label={t('item.restore')} icon="↩" color="var(--primary)"
                onClick={() => handleRestore(contextMenu.itemId)} />
              <ContextItem label={t('item.deletePermanently')} icon="✕" color="var(--accent)"
                onClick={() => handleDeletePermanently(contextMenu.itemId)} />
            </>
          ) : (
            <ContextItem label={t('item.moveToTrash')} icon="🗑" color="var(--accent)"
              onClick={() => handleTrash(contextMenu.itemId)} />
          )}
        </div>
      )}
    </div>
  )
}

function ContextItem({ label, icon, color, onClick }: {
  label: string; icon: string; color: string; onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', padding: '7px 12px',
        borderRadius: 'var(--radius-md)', border: 'none',
        background: 'transparent', color,
        fontSize: 13, fontWeight: 500, textAlign: 'left',
      }}
    >
      <span>{icon}</span>
      {label}
    </button>
  )
}
