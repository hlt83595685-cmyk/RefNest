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
    const items = await window.refnest.items.getAll()
    set({ items })
  },

  setSelectedId: (id) => set({ selectedId: id }),
  setActiveCollection: (id) => set({ activeCollection: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),
}))
