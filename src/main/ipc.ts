import { IpcMain } from 'electron'
import { getAllItems, getItemById, createItem, updateItem, deleteItem, searchItems } from './db/items'

export function registerIpcHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('items:getAll', (_e, libraryId?: number) => getAllItems(libraryId))
  ipcMain.handle('items:getById', (_e, id: number) => getItemById(id))
  ipcMain.handle('items:create', (_e, data) => createItem(data))
  ipcMain.handle('items:update', (_e, id: number, data) => updateItem(id, data))
  ipcMain.handle('items:delete', (_e, id: number) => deleteItem(id))
  ipcMain.handle('items:search', (_e, query: string) => searchItems(query))
}
