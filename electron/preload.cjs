// Runs in the sandboxed renderer before the page. Exposes the two desktop capabilities the page uses.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  // Renders a standalone HTML document to PDF after the user chose where to save it (the dialog proposes
  // `name`.pdf): resolves to { canceled } or { canceled: false, token, pdf }, the bytes to complete and hand
  // back to writePdf.
  exportPdf: (html, name) => ipcRenderer.invoke('export-pdf', html, name),
  // Writes the final bytes of the PDF at the place the token stands for.
  writePdf: (token, bytes) => ipcRenderer.invoke('write-pdf', token, bytes),
  // Commands sent by the application menu: 'export-pdf', 'export-pdf-plain', 'export-docx', 'export-docx-plain', 'export-html', 'export-markdown',
  // 'export-archive', 'export-project', 'import', 'print', 'mode-edit', 'mode-split', 'mode-view',
  // 'toggle-sidebar', 'theme-system', 'theme-light' and 'theme-dark'.
  onCommand: callback => ipcRenderer.on('command', (_event, command) => callback(String(command))),
});
