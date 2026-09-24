// Electron main process for the desktop build. It serves the Vite build (dist/) over a private app://
// scheme, keeps the renderer sandboxed, and adds one native capability: direct PDF export through
// Chromium's print-to-PDF, exposed to the page as `window.desktop.exportPdf` by preload.cjs.
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const APP_ORIGIN = 'app://studio';
const PDF_TIMEOUT_MS = 30_000;
const isMac = process.platform === 'darwin';

// Portable Windows build: keep the saved document and view settings next to the executable.
// MPS_USER_DATA lets the integration tests start from an isolated, empty profile.
if (process.env.MPS_USER_DATA) {
  app.setPath('userData', process.env.MPS_USER_DATA);
} else if (process.env.PORTABLE_EXECUTABLE_DIR) {
  app.setPath('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'markdown-paged-studio-data'));
}

// A standard, secure scheme gives the page a real origin: localStorage, blob URLs, downloads and
// window.open() behave exactly as they do on https, which file:// would not guarantee.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// HTML documents waiting to be rendered to PDF, served under app://studio/print/<id>.
const pdfJobs = new Map();

function notFound() {
  return new Response('Not found', { status: 404 });
}

function registerAppProtocol() {
  protocol.handle('app', async request => {
    const url = new URL(request.url);
    if (url.host !== 'studio') return notFound();

    if (url.pathname.startsWith('/print/')) {
      const html = pdfJobs.get(url.pathname.slice('/print/'.length));
      return html ? new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }) : notFound();
    }

    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.normalize(path.join(DIST, relative));
    if (!file.startsWith(DIST + path.sep)) return notFound();
    try {
      return await net.fetch(pathToFileURL(file).href);
    } catch {
      return notFound();
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Markdown Paged Studio',
    icon: path.join(__dirname, 'icons', 'icon.png'),
    autoHideMenuBar: !isMac,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The print flow opens an empty window inside the click and then navigates it to a blob: URL.
  // External links go to the system browser; anything else is refused.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url.startsWith('blob:')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 900,
          height: 1000,
          autoHideMenuBar: true,
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
        },
      };
    }
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_ORIGIN)) event.preventDefault();
  });

  win.loadURL(`${APP_ORIGIN}/`);
  return win;
}

// Menu entries reach the page as commands handled next to the toolbar buttons (see preload.cjs).
function sendCommand(command) {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  win?.webContents.send('command', command);
}

function buildMenu() {
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Export PDF…', accelerator: 'CmdOrCtrl+Shift+E', click: () => sendCommand('export-pdf') },
        { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => sendCommand('print') },
        { type: 'separator' },
        { role: isMac ? 'close' : 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function waitForPagination(webContents) {
  const deadline = Date.now() + PDF_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const ready = await webContents.executeJavaScript('document.documentElement.dataset.pagedReady === "true"');
    if (ready) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Pagination did not complete in time');
}

// Render the standalone HTML in a hidden window, wait for Paged.js, and print it to PDF.
ipcMain.handle('export-pdf', async (event, html) => {
  if (typeof html !== 'string' || html.length === 0 || html.length > 100 * 1024 * 1024) {
    throw new Error('Invalid document');
  }
  const owner = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(owner, {
    title: 'Export PDF',
    defaultPath: 'document.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return { canceled: true };

  const id = randomUUID();
  pdfJobs.set(id, html);
  const worker = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  try {
    await worker.loadURL(`${APP_ORIGIN}/print/${id}`);
    await waitForPagination(worker.webContents);
    const pdf = await worker.webContents.printToPDF({
      preferCSSPageSize: true,
      printBackground: true,
      margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 },
    });
    await writeFile(filePath, pdf);
    return { canceled: false, filePath };
  } finally {
    pdfJobs.delete(id);
    if (!worker.isDestroyed()) worker.destroy();
  }
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    registerAppProtocol();
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
}
