// Runs in the sandboxed renderer before the page. Exposes the single desktop capability the page uses.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  // Renders a standalone HTML document to PDF and lets the user choose where to save it.
  exportPdf: html => ipcRenderer.invoke('export-pdf', html),
});
