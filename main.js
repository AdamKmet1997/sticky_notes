/* eslint-env node */
/* global __dirname, process */

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  screen,
  Notification,
  nativeImage,
} = require('electron');
const fs = require('fs');
const path = require('path');

let tray = null;
let window = null;
let keepOpen = false;
let hideTimer = null;

const STORE_VERSION = 2;

function getStorePath() {
  return path.join(app.getPath('userData'), 'notes-store.json');
}

function defaultStore() {
  return {
    version: STORE_VERSION,
    notes: [],
    globalReminder: null,
    settings: {
      keepOpen: false,
      theme: 'system',
      view: 'board',
    },
  };
}

function readStore() {
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf8');
    const parsed = JSON.parse(raw);
    const base = defaultStore();
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    };
  } catch {
    return defaultStore();
  }
}

function writeStore(store) {
  const payload = {
    ...defaultStore(),
    ...store,
    version: STORE_VERSION,
    settings: { ...defaultStore().settings, ...(store.settings || {}) },
  };
  fs.mkdirSync(path.dirname(getStorePath()), { recursive: true });
  fs.writeFileSync(getStorePath(), JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

function applyKeepOpen(value) {
  keepOpen = Boolean(value);
  if (window && !window.isDestroyed()) {
    window.setAlwaysOnTop(keepOpen);
  }
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Show Sticky Notes',
      click: () => showWindow(),
    },
    {
      label: 'New Note',
      accelerator: 'CommandOrControl+N',
      click: () => {
        showWindow();
        if (window) window.webContents.send('create-note');
      },
    },
    { type: 'separator' },
    {
      label: 'Keep window open',
      type: 'checkbox',
      checked: keepOpen,
      click: (item) => {
        applyKeepOpen(item.checked);
        const store = readStore();
        store.settings.keepOpen = keepOpen;
        writeStore(store);
        if (window) window.webContents.send('keep-open-changed', keepOpen);
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      accelerator: 'CommandOrControl+Q',
      click: () => app.quit(),
    },
  ]);
}

function refreshTrayMenu() {
  if (tray && !tray.isDestroyed()) {
    tray.setContextMenu(buildTrayMenu());
  }
}

app.on('ready', () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.adamkmet.stickynotes');
  }
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  const store = readStore();
  applyKeepOpen(store.settings.keepOpen);

  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('Sticky Notes');
  refreshTrayMenu();
  tray.on('click', toggleWindow);

  createWindow();
});

ipcMain.handle('load-store', () => readStore());

ipcMain.handle('save-store', (_event, store) => {
  const saved = writeStore(store || {});
  if (typeof saved.settings.keepOpen === 'boolean' && saved.settings.keepOpen !== keepOpen) {
    applyKeepOpen(saved.settings.keepOpen);
    refreshTrayMenu();
  }
  return saved;
});

ipcMain.on('set-keep-open', (_event, value) => {
  applyKeepOpen(value);
  const store = readStore();
  store.settings.keepOpen = keepOpen;
  writeStore(store);
  refreshTrayMenu();
});

ipcMain.on('show-window', () => {
  showWindow();
});

ipcMain.on('show-notification', (_event, payload = {}) => {
  if (!Notification.isSupported()) return;
  const notification = new Notification({
    title: payload.title || 'Sticky Notes',
    body: payload.body || '',
    silent: false,
  });
  notification.on('click', () => {
    showWindow();
    if (payload.noteTitle && window) {
      window.webContents.send('focus-note-search', payload.noteTitle);
    }
  });
  notification.show();
});

ipcMain.on('hide-window', () => {
  if (window && !keepOpen) window.hide();
});

function createWindow() {
  window = new BrowserWindow({
    minWidth: 720,
    minHeight: 560,
    width: 960,
    height: 720,
    show: false,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 14, y: 14 },
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  window.loadFile('index.html');

  window.webContents.on('did-finish-load', () => {
    window.webContents.setZoomFactor(1);
  });

  window.on('blur', () => {
    if (keepOpen || !window || window.webContents.isDevToolsOpened()) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (window && !window.isDestroyed() && !window.isFocused() && !keepOpen) {
        window.hide();
      }
    }, 180);
  });

  window.on('focus', () => {
    clearTimeout(hideTimer);
  });
}

function toggleWindow() {
  if (!window) return;
  if (window.isVisible()) {
    if (!keepOpen) window.hide();
  } else {
    showWindow();
  }
}

function showWindow() {
  if (!window) return;
  const trayBounds = tray ? tray.getBounds() : { x: 0, y: 0, width: 0, height: 0 };
  const windowBounds = window.getBounds();
  const display = screen.getDisplayMatching(trayBounds);
  const screenBounds = display.workArea;

  const trayCenterX = trayBounds.x + trayBounds.width / 2;
  const trayCenterY = trayBounds.y + trayBounds.height / 2;
  const screenCenterX = screenBounds.x + screenBounds.width / 2;
  const screenCenterY = screenBounds.y + screenBounds.height / 2;
  const isTop = trayCenterY < screenCenterY;
  const isLeft = trayCenterX < screenCenterX;

  const x = isLeft
    ? screenBounds.x
    : screenBounds.x + screenBounds.width - windowBounds.width;
  const y = isTop
    ? screenBounds.y
    : screenBounds.y + screenBounds.height - windowBounds.height;

  window.setPosition(Math.round(x), Math.round(y), false);
  window.show();
  window.focus();
}
