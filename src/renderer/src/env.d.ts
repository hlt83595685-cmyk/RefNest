/// <reference types="vite/client" />

import type { Item, Creator, Collection, Tag, ImportResult } from '../../shared/types'

interface RefNestAPI {
  items: {
    getAll: (libraryId?: number) => Promise<Item[]>
    getTrashed: (libraryId?: number) => Promise<Item[]>
    getById: (id: number) => Promise<Item | undefined>
    create: (data: Partial<Item>) => Promise<Item>
    update: (id: number, data: Partial<Item>) => Promise<void>
    trash: (id: number) => Promise<void>
    restore: (id: number) => Promise<void>
    delete: (id: number) => Promise<void>
    search: (query: string) => Promise<Item[]>
  }
  creators: {
    getByItem: (itemId: number) => Promise<Creator[]>
    setForItem: (itemId: number, creators: Creator[]) => Promise<void>
  }
  tags: {
    getByItem: (itemId: number) => Promise<Tag[]>
    getAll: () => Promise<Tag[]>
    setForItem: (itemId: number, tagNames: string[]) => Promise<void>
  }
  collections: {
    getAll: (libraryId?: number) => Promise<Collection[]>
    create: (name: string, libraryId?: number, parentId?: number) => Promise<Collection>
    rename: (id: number, name: string) => Promise<void>
    delete: (id: number) => Promise<void>
    addItem: (collectionId: number, itemId: number) => Promise<void>
    removeItem: (collectionId: number, itemId: number) => Promise<void>
    getItems: (collectionId: number) => Promise<Item[]>
  }
  import: {
    openDialog: () => Promise<ImportResult>
  }
}

declare global {
  interface Window {
    refnest: RefNestAPI
    electron: {
      ipcRenderer: {
        send: (channel: string, ...args: unknown[]) => void
        on: (channel: string, func: (...args: unknown[]) => void) => void
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      }
    }
  }
}
