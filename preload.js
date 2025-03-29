const { contextBridge } = require('electron');

// Expose APIs to the renderer process
contextBridge.exposeInMainWorld('api', {
  saveNotes: (notes) => localStorage.setItem('notes', JSON.stringify(notes)),
  loadNotes: () => JSON.parse(localStorage.getItem('notes') || '[]'),
});