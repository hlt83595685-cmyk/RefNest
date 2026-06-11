import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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
