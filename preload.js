const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadStore: () => ipcRenderer.invoke('load-store'),
  saveStore: (store) => ipcRenderer.invoke('save-store', store),
  setKeepOpen: (value) => ipcRenderer.send('set-keep-open', value),
  showWindow: () => ipcRenderer.send('show-window'),
  hideWindow: () => ipcRenderer.send('hide-window'),
  showNotification: (payload) => ipcRenderer.send('show-notification', payload),
  onCreateNote: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('create-note', listener);
    return () => ipcRenderer.removeListener('create-note', listener);
  },
  onKeepOpenChanged: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('keep-open-changed', listener);
    return () => ipcRenderer.removeListener('keep-open-changed', listener);
  },
  onFocusNoteSearch: (callback) => {
    const listener = (_event, title) => callback(title);
    ipcRenderer.on('focus-note-search', listener);
    return () => ipcRenderer.removeListener('focus-note-search', listener);
  },
});
