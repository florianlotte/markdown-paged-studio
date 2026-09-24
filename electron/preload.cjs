// Runs in the sandboxed renderer before the page. Exposes the two desktop capabilities the page uses.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  // Renders a standalone HTML document to PDF and lets the user choose where to save it.
  exportPdf: html => ipcRenderer.invoke('export-pdf', html),
  // Commands sent by the application menu: 'export-pdf', 'print' or 'toggle-sidebar'.
  onCommand: callback => ipcRenderer.on('command', (_event, command) => callback(String(command))),
});
