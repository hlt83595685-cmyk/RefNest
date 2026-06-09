import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const refnestAPI = {
  items: {
    getAll: (libraryId?: number) => ipcRenderer.invoke('items:getAll', libraryId),
    getById: (id: number) => ipcRenderer.invoke('items:getById', id),
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('items:create', data),
    update: (id: number, data: Record<string, unknown>) =>
      ipcRenderer.invoke('items:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('items:delete', id),
    search: (query: string) => ipcRenderer.invoke('items:search', query),
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
