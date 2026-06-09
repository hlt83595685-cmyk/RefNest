/// <reference types="vite/client" />

import type { Item } from '../../shared/types'

interface RefNestAPI {
  items: {
    getAll: (libraryId?: number) => Promise<Item[]>
    getById: (id: number) => Promise<Item | undefined>
    create: (data: Record<string, unknown>) => Promise<Item>
    update: (id: number, data: Record<string, unknown>) => Promise<void>
    delete: (id: number) => Promise<void>
    search: (query: string) => Promise<Item[]>
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
