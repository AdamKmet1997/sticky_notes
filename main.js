/* eslint-env node */
/* global __dirname, process */

const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');

// // For hot reload during development (optional)
// require('electron-reload')(__dirname, {
//   electron: require(path.join(__dirname, 'node_modules', 'electron'))
// });

let tray = null;
let window = null;

app.on('ready', () => {
  console.log('App is ready');
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([]);
  tray.setToolTip('Sticky Notes');
  tray.setContextMenu(contextMenu);

  createWindow();

  tray.on('click', toggleWindow);
});

// Listen for the IPC message to show the window
ipcMain.on('show-window', () => {
  showWindow();
});

function createWindow() {
  window = new BrowserWindow({
    width: 600,
    height: 600,
    show: false,
    frame: false,
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
    if (!window.webContents.isDevToolsOpened()) {
      window.hide();
    }
  });
}

function toggleWindow() {
  if (window.isVisible()) {
    window.hide();
  } else {
    showWindow();
  }
}

function showWindow() {
  const trayBounds = tray.getBounds();
  const windowBounds = window.getBounds();
  const x = Math.round(
    trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2
  );
  const y = Math.round(trayBounds.y + trayBounds.height);

  window.setPosition(x, y, false);
  window.show();
  window.focus();
}
