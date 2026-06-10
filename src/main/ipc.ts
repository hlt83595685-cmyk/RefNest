import { IpcMain, dialog, shell } from 'electron'
import {
  getAllItems, getTrashedItems, getItemById,
  createItem, updateItem, trashItem, restoreItem, permanentlyDeleteItem, emptyTrash, searchItems
} from './db/items'
import { getCreatorsByItem, setCreatorsForItem } from './db/creators'
import { getTagsByItem, getAllTags, setTagsForItem, deleteOrphanTags } from './db/tags'
import {
  getAllCollections, createCollection, renameCollection, deleteCollection,
  addItemToCollection, removeItemFromCollection, getItemsByCollection
} from './db/collections'
import { importBibTeX, importCSLJSON } from './importer'
import { importPDF } from './pdfImporter'
import {
  getAttachmentsByItem, addAttachment, removeAttachment, getAttachmentPath
} from './db/attachments'

export function registerIpcHandlers(ipcMain: IpcMain): void {
  // Items
  ipcMain.handle('items:getAll', (_e, libraryId?: number) => getAllItems(libraryId))
  ipcMain.handle('items:getTrashed', (_e, libraryId?: number) => getTrashedItems(libraryId))
  ipcMain.handle('items:getById', (_e, id: number) => getItemById(id))
  ipcMain.handle('items:create', (_e, data) => createItem(data))
  ipcMain.handle('items:update', (_e, id: number, data) => updateItem(id, data))
  ipcMain.handle('items:trash', (_e, id: number) => trashItem(id))
  ipcMain.handle('items:restore', (_e, id: number) => restoreItem(id))
  ipcMain.handle('items:delete', (_e, id: number) => permanentlyDeleteItem(id))
  ipcMain.handle('items:emptyTrash', (_e, libraryId?: number) => emptyTrash(libraryId))
  ipcMain.handle('items:search', (_e, query: string) => searchItems(query))

  // Creators
  ipcMain.handle('creators:getByItem', (_e, itemId: number) => getCreatorsByItem(itemId))
  ipcMain.handle('creators:setForItem', (_e, itemId: number, creators) =>
    setCreatorsForItem(itemId, creators)
  )

  // Tags
  ipcMain.handle('tags:getByItem', (_e, itemId: number) => getTagsByItem(itemId))
  ipcMain.handle('tags:getAll', () => getAllTags())
  ipcMain.handle('tags:setForItem', (_e, itemId: number, tagNames: string[]) => {
    setTagsForItem(itemId, tagNames)
    deleteOrphanTags()
  })

  // Collections
  ipcMain.handle('collections:getAll', (_e, libraryId?: number) => getAllCollections(libraryId))
  ipcMain.handle('collections:create', (_e, name: string, libraryId?: number, parentId?: number) =>
    createCollection(name, libraryId, parentId)
  )
  ipcMain.handle('collections:rename', (_e, id: number, name: string) => renameCollection(id, name))
  ipcMain.handle('collections:delete', (_e, id: number) => deleteCollection(id))
  ipcMain.handle('collections:addItem', (_e, collectionId: number, itemId: number) =>
    addItemToCollection(collectionId, itemId)
  )
  ipcMain.handle('collections:removeItem', (_e, collectionId: number, itemId: number) =>
    removeItemFromCollection(collectionId, itemId)
  )
  ipcMain.handle('collections:getItems', (_e, collectionId: number) =>
    getItemsByCollection(collectionId)
  )

  // Attachments
  ipcMain.handle('attachments:getByItem', (_e, itemId: number) => getAttachmentsByItem(itemId))
  ipcMain.handle('attachments:add', async (_e, itemId: number) => {
    const result = await dialog.showOpenDialog({
      title: 'Add Attachment',
      filters: [
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return addAttachment(itemId, result.filePaths[0])
  })
  ipcMain.handle('attachments:remove', (_e, id: number) => removeAttachment(id))
  ipcMain.handle('attachments:getPath', (_e, id: number) => getAttachmentPath(id))
  ipcMain.handle('attachments:openExternal', (_e, id: number) => {
    const path = getAttachmentPath(id)
    if (path) shell.openPath(path)
  })
  ipcMain.handle('attachments:openPath', (_e, filePath: string) => {
    shell.openPath(filePath)
  })

  // Import
  ipcMain.handle('import:openDialog', async (_e, collectionId?: number) => {
    const result = await dialog.showOpenDialog({
      title: 'Import References',
      filters: [
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'BibTeX', extensions: ['bib'] },
        { name: 'CSL-JSON', extensions: ['json'] },
        { name: 'All Supported', extensions: ['pdf', 'bib', 'json'] },
      ],
      properties: ['openFile', 'multiSelections'],
    })
    if (result.canceled) return { canceled: true, imported: 0 }

    let imported = 0
    for (const filePath of result.filePaths) {
      const lower = filePath.toLowerCase()
      if (lower.endsWith('.pdf')) imported += await importPDF(filePath, collectionId)
      else if (lower.endsWith('.bib')) imported += importBibTeX(filePath, collectionId)
      else if (lower.endsWith('.json')) imported += importCSLJSON(filePath, collectionId)
    }
    return { canceled: false, imported }
  })
}
