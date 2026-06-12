import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// All ipcRenderer.on listeners must be registered at the top level of the
// preload script -- contextBridge cannot serialize listener registrations
// that are nested inside sub-objects.

type Pdf2mdStatusCb = (e: {
  filename: string
  state: 'running' | 'done' | 'error' | 'idle'
  message: string
  chunk?: string
  pending: number
}) => void

type Pdf2mdProgressCb = (p: {
  state: string
  message?: string
  progress?: number
}) => void

let _pdf2mdStatusCb: Pdf2mdStatusCb | null = null
let _pdf2mdProgressCb: Pdf2mdProgressCb | null = null
let _settingsOpenCb: ((tab: string) => void) | null = null
let _setLocaleCb: ((locale: string) => void) | null = null

ipcRenderer.on('pdf2md:status', (_ev, e) => { _pdf2mdStatusCb?.(e) })
ipcRenderer.on('tool:pdf2md:progress', (_ev, p) => { _pdf2mdProgressCb?.(p) })
ipcRenderer.on('settings:open', (_ev, tab: string) => { _settingsOpenCb?.(tab) })
ipcRenderer.on('settings:setLocale', (_ev, locale: string) => { _setLocaleCb?.(locale) })

const refnestAPI = {
  items: {
    getAll: (libraryId?: number) => ipcRenderer.invoke('items:getAll', libraryId),
    getTrashed: (libraryId?: number) => ipcRenderer.invoke('items:getTrashed', libraryId),
    getByCollection: (collectionId: number) => ipcRenderer.invoke('items:getByCollection', collectionId),
    getById: (id: number) => ipcRenderer.invoke('items:getById', id),
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('items:create', data),
    update: (id: number, data: Record<string, unknown>) => ipcRenderer.invoke('items:update', id, data),
    trash: (id: number) => ipcRenderer.invoke('items:trash', id),
    restore: (id: number) => ipcRenderer.invoke('items:restore', id),
    delete: (id: number) => ipcRenderer.invoke('items:delete', id),
    emptyTrash: (libraryId?: number) => ipcRenderer.invoke('items:emptyTrash', libraryId),
    extractKeywords: (itemId: number) => ipcRenderer.invoke('items:extractKeywords', itemId),
    search: (query: string) => ipcRenderer.invoke('items:search', query),
  },
  creators: {
    getByItem: (itemId: number) => ipcRenderer.invoke('creators:getByItem', itemId),
    setForItem: (itemId: number, creators: unknown[]) =>
      ipcRenderer.invoke('creators:setForItem', itemId, creators),
  },
  tags: {
    getByItem: (itemId: number) => ipcRenderer.invoke('tags:getByItem', itemId),
    getAll: () => ipcRenderer.invoke('tags:getAll'),
    setForItem: (itemId: number, tagNames: string[]) =>
      ipcRenderer.invoke('tags:setForItem', itemId, tagNames),
  },
  collections: {
    getAll: (libraryId?: number) => ipcRenderer.invoke('collections:getAll', libraryId),
    create: (name: string, libraryId?: number, parentId?: number) =>
      ipcRenderer.invoke('collections:create', name, libraryId, parentId),
    rename: (id: number, name: string) => ipcRenderer.invoke('collections:rename', id, name),
    delete: (id: number) => ipcRenderer.invoke('collections:delete', id),
    addItem: (collectionId: number, itemId: number) =>
      ipcRenderer.invoke('collections:addItem', collectionId, itemId),
    removeItem: (collectionId: number, itemId: number) =>
      ipcRenderer.invoke('collections:removeItem', collectionId, itemId),
    getItems: (collectionId: number) => ipcRenderer.invoke('collections:getItems', collectionId),
  },
  attachments: {
    getByItem: (itemId: number) => ipcRenderer.invoke('attachments:getByItem', itemId),
    add: (itemId: number) => ipcRenderer.invoke('attachments:add', itemId),
    remove: (id: number) => ipcRenderer.invoke('attachments:remove', id),
    getPath: (id: number) => ipcRenderer.invoke('attachments:getPath', id),
    openExternal: (id: number) => ipcRenderer.invoke('attachments:openExternal', id),
    openPath: (filePath: string) => ipcRenderer.invoke('attachments:openPath', filePath),
  },
  import: {
    openDialog: (collectionId?: number) => ipcRenderer.invoke('import:openDialog', collectionId),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
    pickStoragePath: () => ipcRenderer.invoke('settings:pickStoragePath'),
    notifyLocale: (locale: string) => ipcRenderer.send('menu:setLocale', locale),
  },
  // pdf2md status (queue-level, single LED)
  onPdf2mdStatus: (cb: Pdf2mdStatusCb) => { _pdf2mdStatusCb = cb },
  offPdf2mdStatus: () => { _pdf2mdStatusCb = null },
  // menu-driven settings panel
  onSettingsOpen: (cb: (tab: string) => void) => { _settingsOpenCb = cb },
  offSettingsOpen: () => { _settingsOpenCb = null },
  onSetLocale: (cb: (locale: string) => void) => { _setLocaleCb = cb },
  offSetLocale: () => { _setLocaleCb = null },
  // tools
  tools: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
    pickPdf: () => ipcRenderer.invoke('tool:pick-pdf'),
    pickDir: () => ipcRenderer.invoke('tool:pick-dir'),
    pdf2md: (filePath: string, outputDir: string) =>
      ipcRenderer.invoke('tool:pdf2md', filePath, outputDir),
    onPdf2mdProgress: (cb: Pdf2mdProgressCb) => { _pdf2mdProgressCb = cb },
    offPdf2mdProgress: () => { _pdf2mdProgressCb = null },
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('refnest', refnestAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.refnest = refnestAPI
}
