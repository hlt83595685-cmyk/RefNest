import { app, BrowserWindow, shell, ipcMain, protocol, net } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase } from './db'
import { startLocalServer, stopLocalServer } from './server'
import { registerIpcHandlers } from './ipc'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Register refnest-file:// protocol so the renderer can load local files
// (file:// is blocked by Electron's CSP in sandboxed contexts)
protocol.registerSchemesAsPrivileged([
  { scheme: 'refnest-file', privileges: { secure: true, supportFetchAPI: true, stream: true } },
])

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.refnest.app')

  protocol.handle('refnest-file', (request) => {
    // URL format: refnest-file:///C:/path/to/file.pdf
    const filePath = decodeURIComponent(request.url.replace('refnest-file://', ''))
    return net.fetch(pathToFileURL(filePath).toString())
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Init core services
  try {
    await initDatabase()
    console.log('[main] Database initialized')
  } catch (err) {
    console.error('[main] Database init failed:', err)
  }
  try {
    startLocalServer()
    console.log('[main] Local server started on port 23120')
  } catch (err) {
    console.error('[main] Local server failed:', err)
  }
  registerIpcHandlers(ipcMain)
  console.log('[main] IPC handlers registered')

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopLocalServer()
  if (process.platform !== 'darwin') app.quit()
})
