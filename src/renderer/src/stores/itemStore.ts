import { create } from 'zustand'
import type { Item } from '../../../shared/types'

interface ItemStore {
  items: Item[]
  selectedId: number | null
  activeCollection: string
  searchQuery: string
  // PDF viewer state
  viewerPath: string | null
  viewerFilename: string | null
  loadItems: () => Promise<void>
  setSelectedId: (id: number | null) => void
  setActiveCollection: (id: string) => void
  setSearchQuery: (q: string) => void
  openPdf: (path: string, filename: string) => void
  closePdf: () => void
}

export const useItemStore = create<ItemStore>((set) => ({
  items: [],
  selectedId: null,
  activeCollection: 'all',
  searchQuery: '',
  viewerPath: null,
  viewerFilename: null,

  loadItems: async () => {
    try {
      const { activeCollection } = useItemStore.getState()
      let items: Item[]
      if (activeCollection === 'trash') {
        items = await window.refnest.items.getTrashed()
      } else if (activeCollection.startsWith('col:')) {
        const colId = parseInt(activeCollection.slice(4), 10)
        items = await window.refnest.collections.getItems(colId) as Item[]
      } else if (activeCollection === 'recent') {
        const all = await window.refnest.items.getAll()
        items = all.slice(0, 50)
      } else {
        items = await window.refnest.items.getAll()
      }
      set({ items: items ?? [] })
    } catch (err) {
      console.error('[itemStore] loadItems failed:', err)
    }
  },

  setSelectedId: (id) => set({ selectedId: id }),
  setActiveCollection: (id) => {
    set({ activeCollection: id, selectedId: null, viewerPath: null })
    setTimeout(() => useItemStore.getState().loadItems(), 0)
  },
  setSearchQuery: (q) => set({ searchQuery: q }),
  openPdf: (path, filename) => set({ viewerPath: path, viewerFilename: filename }),
  closePdf: () => set({ viewerPath: null, viewerFilename: null }),
}))
