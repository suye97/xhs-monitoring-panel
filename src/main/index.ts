import { app, BrowserWindow, ipcMain } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HistoryStore } from './history';
import { registerIpcHandlers } from './ipc';
import { createJevFilter } from './jev';
import { createMonitor } from './monitor';
import { createOpenCliCollector } from './opencli';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 860,
    minHeight: 640,
    show: false,
    backgroundColor: '#f5f7fb',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(currentDirectory, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void window.loadFile(join(currentDirectory, '../renderer/index.html'));
  return window;
}

app.whenReady().then(() => {
  const history = new HistoryStore(join(app.getPath('userData'), 'capture-history.json'));
  const search = createMonitor({ collector: createOpenCliCollector(), validityFilter: createJevFilter() });
  registerIpcHandlers(ipcMain, {
    search,
    add: result => history.add(result),
    list: () => history.list(),
    get: id => history.get(id),
  });
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}).catch(error => {
  console.error('Application startup failed', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
