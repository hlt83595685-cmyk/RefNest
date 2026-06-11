/// <reference types="vite/client" />

import type { Item, Creator, Collection, Tag, Attachment, ImportResult } from '../../shared/types'

interface RefNestAPI {
  items: {
    getAll: (libraryId?: number) => Promise<Item[]>
    getTrashed: (libraryId?: number) => Promise<Item[]>
    getByCollection: (collectionId: number) => Promise<Item[]>
    getById: (id: number) => Promise<Item | undefined>
    create: (data: Partial<Item>) => Promise<Item>
    update: (id: number, data: Partial<Item>) => Promise<void>
    trash: (id: number) => Promise<void>
    restore: (id: number) => Promise<void>
    delete: (id: number) => Promise<void>
    emptyTrash: (libraryId?: number) => Promise<void>
    extractKeywords: (itemId: number) => Promise<{ added: number; total: number }>
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
  attachments: {
    getByItem: (itemId: number) => Promise<Attachment[]>
    add: (itemId: number) => Promise<Attachment | null>
    remove: (id: number) => Promise<void>
    getPath: (id: number) => Promise<string | null>
    openExternal: (id: number) => Promise<void>
    openPath: (filePath: string) => Promise<void>
  }
  settings: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
  }
  onPdf2mdStatus: (cb: (e: {
    filename: string
    state: 'running' | 'done' | 'error' | 'idle'
    message: string
    chunk?: string
    pending: number
  }) => void) => void
  offPdf2mdStatus: () => void
  import: {
    openDialog: () => Promise<ImportResult>
  }
  tools: {
    openExternal: (url: string) => Promise<void>
    pickPdf: () => Promise<string | null>
    pickDir: () => Promise<string | null>
    pdf2md: (filePath: string, outputDir: string) => Promise<{ outPath?: string; error?: string }>
    onPdf2mdProgress: (cb: (p: { state: string; message?: string; progress?: number }) => void) => void
    offPdf2mdProgress: () => void
  }
}

declare global {
  interface Window {
    refnest: RefNestAPI
    electron: {
      ipcRenderer: {
        send: (channel: string, ...args: unknown[]) => void
        on: (channel: string, func: (...args: unknown[]) => void) => () => void
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      }
    }
  }
}
