import { useState } from 'react'
import { Toolbar } from './Toolbar'
import { CollectionPane } from '../item-tree/CollectionPane'
import { ItemListPane } from '../item-tree/ItemListPane'
import { DetailPane } from '../detail-panel/DetailPane'
import { useItemStore } from '../../stores/itemStore'

export function MainLayout(): JSX.Element {
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [detailWidth, setDetailWidth] = useState(340)
  const selectedId = useItemStore((s) => s.selectedId)

  return (
    <div className="flex flex-col h-full">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Collection Tree */}
        <aside
          className="shrink-0 border-r overflow-y-auto"
          style={{ width: sidebarWidth, borderColor: 'var(--border)' }}
        >
          <CollectionPane />
        </aside>

        {/* Center: Item List */}
        <main className="flex-1 overflow-hidden flex flex-col">
          <ItemListPane />
        </main>

        {/* Right: Detail Panel */}
        {selectedId !== null && (
          <aside
            className="shrink-0 border-l overflow-hidden flex flex-col"
            style={{ width: detailWidth, borderColor: 'var(--border)' }}
          >
            <DetailPane itemId={selectedId} />
          </aside>
        )}
      </div>
    </div>
  )
}
