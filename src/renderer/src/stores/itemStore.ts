import { create } from 'zustand'
import type { Item } from '../../../shared/types'

interface ItemStore {
  items: Item[]
  selectedId: number | null
  activeCollection: string
  searchQuery: string
  loadItems: () => Promise<void>
  setSelectedId: (id: number | null) => void
  setActiveCollection: (id: string) => void
  setSearchQuery: (q: string) => void
}

export const useItemStore = create<ItemStore>((set) => ({
  items: [],
  selectedId: null,
  activeCollection: 'all',
  searchQuery: '',

  loadItems: async () => {
    try {
      const { activeCollection } = useItemStore.getState()
      const items = activeCollection === 'trash'
        ? await window.refnest.items.getTrashed()
        : await window.refnest.items.getAll()
      set({ items: items ?? [] })
    } catch (err) {
      console.error('[itemStore] loadItems failed:', err)
    }
  },

  setSelectedId: (id) => set({ selectedId: id }),
  setActiveCollection: (id) => {
    set({ activeCollection: id, selectedId: null })
    // reload after state update so loadItems reads the new activeCollection
    setTimeout(() => useItemStore.getState().loadItems(), 0)
  },
  setSearchQuery: (q) => set({ searchQuery: q }),
}))
