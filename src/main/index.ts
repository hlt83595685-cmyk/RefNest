import { app, BrowserWindow, shell, ipcMain, protocol, net, Menu } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase } from './db'
import { startLocalServer, stopLocalServer } from './server'
import { registerIpcHandlers } from './ipc'
import { setMainWindowRef } from './pdf2mdService'

let mainWindow: BrowserWindow | null = null

const menuLabels: Record<string, Record<string, string>> = {
  zh: {
    settings:    '设置',
    storagePath: '文件存储路径...',
    pdf2md:      'pdf2md 设置...',
    language:    '语言',
    langZh:      '中文',
    langEn:      'English',
  },
  en: {
    settings:    'Settings',
    storagePath: 'Storage Path...',
    pdf2md:      'pdf2md Settings...',
    language:    'Language',
    langZh:      '中文',
    langEn:      'English',
  },
}

function buildMenu(locale: string): void {
  const L = menuLabels[locale] ?? menuLabels['zh']
  const menu = Menu.buildFromTemplate([
    {
      label: L.settings,
      submenu: [
        {
          label: L.storagePath,
          click: (): void => { mainWindow?.webContents.send('settings:open', 'storage') },
        },
        {
          label: L.pdf2md,
          click: (): void => { mainWindow?.webContents.send('settings:open', 'pdf2md') },
        },
        { type: 'separator' },
        {
          label: L.language,
          submenu: [
            {
              label: L.langZh,
              type: 'radio',
              checked: locale === 'zh',
              click: (): void => {
                mainWindow?.webContents.send('settings:setLocale', 'zh')
                buildMenu('zh')
              },
            },
            {
              label: L.langEn,
              type: 'radio',
              checked: locale === 'en',
              click: (): void => {
                mainWindow?.webContents.send('settings:setLocale', 'en')
                buildMenu('en')
              },
            },
          ],
        },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    setMainWindowRef(mainWindow!)
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

  buildMenu('zh')

  // Renderer can ask main to rebuild menu with a new locale
  ipcMain.on('menu:setLocale', (_e, locale: string) => buildMenu(locale))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopLocalServer()
  if (process.platform !== 'darwin') app.quit()
})
