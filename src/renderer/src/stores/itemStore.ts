import { create } from 'zustand'
import type { Item } from '../../../shared/types'

interface ItemStore {
  items: Item[]
  selectedId: number | null
  activeCollection: string
  searchQuery: string
  yearSort: 'none' | 'desc'
  // PDF viewer state
  viewerPath: string | null
  viewerFilename: string | null
  viewerItemId: number | null
  loadItems: () => Promise<void>
  setSelectedId: (id: number | null) => void
  setActiveCollection: (id: string) => void
  setSearchQuery: (q: string) => void
  toggleYearSort: () => void
  openPdf: (path: string, filename: string, itemId?: number) => void
  closePdf: () => void
}

export const useItemStore = create<ItemStore>((set) => ({
  items: [],
  selectedId: null,
  activeCollection: 'all',
  searchQuery: '',
  yearSort: 'none',
  viewerPath: null,
  viewerFilename: null,
  viewerItemId: null,

  loadItems: async () => {
    try {
      const { activeCollection } = useItemStore.getState()
      let items: Item[]
      if (activeCollection === 'trash') {
        items = await window.refnest.items.getTrashed()
      } else if (activeCollection.startsWith('col:')) {
        const colId = parseInt(activeCollection.slice(4), 10)
        items = await window.refnest.items.getByCollection(colId) as Item[]
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
    set({ activeCollection: id, selectedId: null, viewerPath: null, viewerItemId: null, yearSort: 'none' })
    setTimeout(() => useItemStore.getState().loadItems(), 0)
  },
  setSearchQuery: (q) => set({ searchQuery: q }),
  toggleYearSort: () => set((s) => ({ yearSort: s.yearSort === 'desc' ? 'none' : 'desc' })),
  openPdf: (path, filename, itemId) => set({ viewerPath: path, viewerFilename: filename, viewerItemId: itemId ?? null }),
  closePdf: () => set({ viewerPath: null, viewerFilename: null, viewerItemId: null }),
}))
