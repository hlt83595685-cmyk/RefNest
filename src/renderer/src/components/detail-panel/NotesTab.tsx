import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Note } from '../../../../shared/types'

export function NotesTab({ itemId }: { itemId: number }): JSX.Element {
  const { t } = useTranslation('common')
  const [notes, setNotes] = useState<Note[]>([])
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const reload = useCallback(async () => {
    const list = await window.refnest.notes.getByItem(itemId)
    setNotes(list)
  }, [itemId])

  useEffect(() => { reload() }, [reload])

  // Focus textarea when editing starts
  useEffect(() => {
    if (editingId !== null) setTimeout(() => textareaRef.current?.focus(), 50)
  }, [editingId])

  const startNew = (): void => {
    setDraft('')
    setEditingId('new')
  }

  const startEdit = (note: Note): void => {
    setDraft(note.content)
    setEditingId(note.id)
  }

  const cancelEdit = (): void => {
    setEditingId(null)
    setDraft('')
  }

  const saveNote = async (): Promise<void> => {
    if (!draft.trim()) { cancelEdit(); return }
    if (editingId === 'new') {
      await window.refnest.notes.create(itemId, draft.trim())
    } else if (typeof editingId === 'number') {
      await window.refnest.notes.update(editingId, draft.trim())
    }
    setEditingId(null)
    setDraft('')
    await reload()
  }

  const deleteNote = async (id: number): Promise<void> => {
    await window.refnest.notes.delete(id)
    if (editingId === id) { setEditingId(null); setDraft('') }
    await reload()
  }

  const formatDate = (ts: number): string => {
    const d = new Date(ts * 1000)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px 8px',
        borderBottom: '1px solid var(--separator)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.04em' }}>
          {notes.length} {t('notes.count')}
        </span>
        <button
          onClick={startNew}
          disabled={editingId !== null}
          style={{
            height: 26, padding: '0 12px', borderRadius: 7,
            border: 'none', background: 'var(--primary)',
            color: '#fff', fontSize: 12, fontWeight: 600,
            cursor: editingId !== null ? 'not-allowed' : 'pointer',
            opacity: editingId !== null ? 0.5 : 1,
          }}
        >
          + {t('notes.add')}
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>

        {/* New note editor */}
        {editingId === 'new' && (
          <NoteEditor
            value={draft}
            onChange={setDraft}
            onSave={saveNote}
            onCancel={cancelEdit}
            textareaRef={textareaRef}
            isNew
          />
        )}

        {notes.length === 0 && editingId !== 'new' && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            {t('notes.empty')}
          </div>
        )}

        {notes.map((note) => (
          <div key={note.id}>
            {editingId === note.id ? (
              <NoteEditor
                value={draft}
                onChange={setDraft}
                onSave={saveNote}
                onCancel={cancelEdit}
                textareaRef={textareaRef}
              />
            ) : (
              <NoteCard
                note={note}
                formatDate={formatDate}
                onEdit={() => startEdit(note)}
                onDelete={() => deleteNote(note.id)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NoteCard({ note, formatDate, onEdit, onDelete }: {
  note: Note
  formatDate: (ts: number) => string
  onEdit: () => void
  onDelete: () => void
}): JSX.Element {
  const [hover, setHover] = useState(false)

  // Render blockquotes and plain text with minimal markdown
  const renderContent = (text: string): JSX.Element[] => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('> ')) {
        return (
          <div key={i} style={{
            borderLeft: '3px solid var(--primary)',
            paddingLeft: 10,
            marginBottom: 2,
            color: 'var(--foreground-2)',
            fontSize: 12,
            fontStyle: 'italic',
          }}>
            {line.slice(2)}
          </div>
        )
      }
      if (line === '---') {
        return <hr key={i} style={{ border: 'none', borderTop: '1px solid var(--separator)', margin: '8px 0' }} />
      }
      return <div key={i} style={{ fontSize: 13, color: 'var(--foreground)', minHeight: 4 }}>{line || ''}</div>
    })
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        margin: '0 12px 8px',
        padding: '10px 12px',
        borderRadius: 10,
        background: hover ? 'var(--surface-2)' : 'transparent',
        border: '1px solid ' + (hover ? 'var(--border)' : 'transparent'),
        transition: 'all 0.15s',
        cursor: 'default',
      }}
    >
      <div style={{ lineHeight: 1.6 }}>
        {renderContent(note.content)}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 8,
      }}>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{formatDate(note.updated_at)}</span>
        {hover && (
          <div style={{ display: 'flex', gap: 4 }}>
            <ActionBtn label="编辑" onClick={onEdit} />
            <ActionBtn label="删除" onClick={onDelete} danger />
          </div>
        )}
      </div>
    </div>
  )
}

function NoteEditor({ value, onChange, onSave, onCancel, textareaRef, isNew }: {
  value: string
  onChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  textareaRef: React.RefObject<HTMLTextAreaElement>
  isNew?: boolean
}): JSX.Element {
  const { t } = useTranslation('common')
  return (
    <div style={{ margin: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('notes.placeholder')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSave() }
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        }}
        style={{
          width: '100%', minHeight: 100, resize: 'vertical',
          border: '1px solid var(--primary)',
          borderRadius: 8, padding: '8px 10px',
          fontSize: 13, fontFamily: 'inherit', lineHeight: 1.6,
          background: 'var(--surface)',
          color: 'var(--foreground)',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 10, color: 'var(--muted)', alignSelf: 'center', marginRight: 4 }}>
          Ctrl+Enter {t('notes.save')}
        </span>
        <ActionBtn label={t('notes.save')} onClick={onSave} primary />
        <ActionBtn label={t('notes.cancel')} onClick={onCancel} />
      </div>
    </div>
  )
}

function ActionBtn({ label, onClick, primary, danger }: {
  label: string; onClick: () => void; primary?: boolean; danger?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        height: 24, padding: '0 10px', borderRadius: 6,
        border: primary ? 'none' : '1px solid var(--border)',
        background: primary ? 'var(--primary)' : danger ? 'transparent' : 'var(--surface)',
        color: primary ? '#fff' : danger ? '#ff3b30' : 'var(--foreground-2)',
        fontSize: 11, fontWeight: 500, cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
