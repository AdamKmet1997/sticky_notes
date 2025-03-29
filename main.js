const { app, BrowserWindow, Tray, Menu } = require('electron');
const path = require('path');

// For hot reload during development (optional)
require('electron-reload')(__dirname, {
  electron: require(path.join(__dirname, 'node_modules', 'electron'))
});

let tray = null;
let window = null;

app.on('ready', () => {
  console.log('App is ready');
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    // { label: 'New Note', click: () => { showWindow(); } },
    // { label: 'Quit', click: () => { app.quit(); } }
  ]);
  tray.setToolTip('Sticky Notes');
  tray.setContextMenu(contextMenu);

  createWindow();

  tray.on('click', toggleWindow);
});

function createWindow() {
  window = new BrowserWindow({
    width: 300,
    height: 400,
    show: false,
    frame: false,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  window.loadFile('index.html');

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
  const x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2));
  const y = Math.round(trayBounds.y + trayBounds.height);

  window.setPosition(x, y, false);
  window.show();
  window.focus();
}
