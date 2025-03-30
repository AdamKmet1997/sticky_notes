const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveNotes: (notes) => localStorage.setItem('notes', JSON.stringify(notes)),
  loadNotes: () => JSON.parse(localStorage.getItem('notes') || '[]'),
  showWindow: () => ipcRenderer.send('show-window'),
});
