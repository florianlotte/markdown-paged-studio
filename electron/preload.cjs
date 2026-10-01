// Runs in the sandboxed renderer before the page. Exposes the two desktop capabilities the page uses.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  // Renders a standalone HTML document to PDF after the user chose where to save it: resolves to
  // { canceled } or { canceled: false, token, pdf }, the bytes to complete and hand back to writePdf.
  exportPdf: html => ipcRenderer.invoke('export-pdf', html),
  // Writes the final bytes of the PDF at the place the token stands for.
  writePdf: (token, bytes) => ipcRenderer.invoke('write-pdf', token, bytes),
  // Commands sent by the application menu: 'export-pdf', 'export-pdf-plain', 'export-html', 'export-project',
  // 'import', 'print' or 'toggle-sidebar'.
  onCommand: callback => ipcRenderer.on('command', (_event, command) => callback(String(command))),
});
