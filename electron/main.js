// Electron main process for the desktop build. It serves the Vite build (dist/) over a private app://
// scheme, keeps the renderer sandboxed, and adds one native capability: direct PDF export through
// Chromium's print-to-PDF, exposed to the page as `window.desktop.exportPdf` by preload.cjs.
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, protocol, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const APP_ORIGIN = 'app://studio';
// Pagination may take as long as pages keep coming, within an overall limit.
const PDF_TIMEOUT_MS = 30_000;
const PDF_LIMIT_MS = 10 * 60_000;
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
    // The window shows the colour of the system theme until the page paints (the page may still choose
    // the other theme: it is a setting of the studio).
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#15181d' : '#e9edf2',
    autoHideMenuBar: !isMac,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL(`${APP_ORIGIN}/`);
  return win;
}

// Every window of the app keeps to its own pages: the main window, the print windows (opened empty inside
// the click, then navigated to a blob: URL) and the hidden PDF worker alike. External links go to the system
// browser; anything else is refused.
const PRINT_WINDOW = {
  width: 900,
  height: 1000,
  autoHideMenuBar: true,
  webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
};
const isOwnPage = url => url.startsWith(APP_ORIGIN) || url === 'about:blank' || url.startsWith('blob:');
const openOutside = url => /^(https?|mailto):/i.test(url) && shell.openExternal(url);

function guardNavigation(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url.startsWith('blob:'))
      return { action: 'allow', overrideBrowserWindowOptions: PRINT_WINDOW };
    openOutside(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (isOwnPage(url)) return;
    event.preventDefault();
    openOutside(url);
  });
}

app.on('web-contents-created', (_event, contents) => guardNavigation(contents));

// Menu entries reach the page as commands handled next to the toolbar buttons (see preload.cjs).
function sendCommand(command) {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  win?.webContents.send('command', command);
}

// Labels of the application menu, in French when the system is: the page follows the same default.
const MENU_FR = {
  File: 'Fichier',
  'Export PDF…': 'Exporter en PDF…',
  'Export PDF without project…': 'Exporter en PDF sans projet…',
  'Export HTML…': 'Exporter en HTML…',
  'Export Markdown…': 'Exporter en Markdown…',
  'Export Markdown files (zip)…': 'Exporter les fichiers Markdown (zip)…',
  'Save project…': 'Enregistrer le projet…',
  'Import…': 'Importer…',
  'Print…': 'Imprimer…',
  View: 'Affichage',
  'Toggle Sidebar': 'Afficher ou masquer la barre latérale',
  Theme: 'Thème',
  Auto: 'Auto',
  Light: 'Clair',
  Dark: 'Sombre',
  Edit: 'Édition',
  'Side by side': 'Côte à côte',
  Preview: 'Aperçu',
  Help: 'Aide',
  'Welcome Tour': 'Visite guidée',
  'Keyboard Shortcuts': 'Raccourcis clavier',
};

function buildMenu() {
  const french = app.getLocale().toLowerCase().startsWith('fr');
  const label = text => (french ? (MENU_FR[text] ?? text) : text);
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: label('File'),
      submenu: [
        { label: label('Export PDF…'), accelerator: 'CmdOrCtrl+Shift+E', click: () => sendCommand('export-pdf') },
        { label: label('Export PDF without project…'), click: () => sendCommand('export-pdf-plain') },
        { label: label('Export HTML…'), click: () => sendCommand('export-html') },
        { label: label('Export Markdown…'), click: () => sendCommand('export-markdown') },
        { label: label('Export Markdown files (zip)…'), click: () => sendCommand('export-archive') },
        { label: label('Save project…'), click: () => sendCommand('export-project') },
        { type: 'separator' },
        { label: label('Import…'), accelerator: 'CmdOrCtrl+O', click: () => sendCommand('import') },
        { type: 'separator' },
        { label: label('Print…'), accelerator: 'CmdOrCtrl+P', click: () => sendCommand('print') },
        { type: 'separator' },
        { role: isMac ? 'close' : 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: label('View'),
      submenu: [
        // Same chords as the page: Ctrl+Alt is AltGr on European keyboards, Cmd+Shift+digits are macOS shots.
        {
          label: label('Edit'),
          accelerator: isMac ? 'Cmd+Alt+1' : 'Ctrl+Shift+1',
          click: () => sendCommand('mode-edit'),
        },
        {
          label: label('Side by side'),
          accelerator: isMac ? 'Cmd+Alt+2' : 'Ctrl+Shift+2',
          click: () => sendCommand('mode-split'),
        },
        {
          label: label('Preview'),
          accelerator: isMac ? 'Cmd+Alt+3' : 'Ctrl+Shift+3',
          click: () => sendCommand('mode-view'),
        },
        { type: 'separator' },
        { label: label('Toggle Sidebar'), accelerator: 'CmdOrCtrl+B', click: () => sendCommand('toggle-sidebar') },
        {
          label: label('Theme'),
          // The page remembers the choice; the menu only sends it.
          submenu: [
            { label: label('Auto'), click: () => sendCommand('theme-system') },
            { label: label('Light'), click: () => sendCommand('theme-light') },
            { label: label('Dark'), click: () => sendCommand('theme-dark') },
          ],
        },
        { type: 'separator' },
        { role: 'reload' },
        // The developer tools belong to a development run, not to a release.
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      label: label('Help'),
      submenu: [
        { label: label('Welcome Tour'), click: () => sendCommand('welcome') },
        { label: label('Keyboard Shortcuts'), click: () => sendCommand('shortcuts') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function waitForPagination(webContents) {
  const limit = Date.now() + PDF_LIMIT_MS;
  let deadline = Date.now() + PDF_TIMEOUT_MS;
  let pages = 0;
  while (Date.now() < Math.min(deadline, limit)) {
    const { ready, count } = await webContents.executeJavaScript(
      '({ ready: document.documentElement.dataset.pagedReady === "true", count: document.querySelectorAll(".pagedjs_page").length })',
    );
    if (ready) return;
    // A long document is still making progress: it gets more time.
    if (count > pages) {
      pages = count;
      deadline = Date.now() + PDF_TIMEOUT_MS;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Pagination did not complete in time');
}

// Places chosen for a PDF, waiting for its bytes: token -> { filePath, expires }. The page never sees the
// path and can only write where the user pointed, once.
const pendingWrites = new Map();
const WRITE_TIMEOUT_MS = 10 * 60_000;

// Render the standalone HTML in a hidden window, wait for Paged.js, and print it to PDF. The bytes go back
// to the page, which attaches the sources of the document and asks `write-pdf` to save the result.
ipcMain.handle('export-pdf', async (event, html, name) => {
  if (typeof html !== 'string' || html.length === 0 || html.length > 100 * 1024 * 1024) {
    throw new Error('Invalid document');
  }
  // The file name proposed by the dialog comes from the title of the document, as in the browser.
  const stem = (typeof name === 'string' ? name : '')
    .replace(/[\\/:*?"<>|\s]+/g, ' ')
    .trim()
    .slice(0, 80);
  const owner = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(owner, {
    title: 'Export PDF',
    defaultPath: `${stem || 'document'}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return { canceled: true };

  for (const [token, pending] of pendingWrites) if (pending.expires < Date.now()) pendingWrites.delete(token);
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
    const token = randomUUID();
    pendingWrites.set(token, { filePath, expires: Date.now() + WRITE_TIMEOUT_MS });
    return { canceled: false, token, pdf: new Uint8Array(pdf) };
  } finally {
    pdfJobs.delete(id);
    if (!worker.isDestroyed()) worker.destroy();
  }
});

ipcMain.handle('write-pdf', async (event, token, bytes) => {
  const pending = typeof token === 'string' ? pendingWrites.get(token) : undefined;
  pendingWrites.delete(token);
  if (!pending || pending.expires < Date.now()) throw new Error('No PDF export is waiting for these bytes');
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > 200 * 1024 * 1024) {
    throw new Error('Invalid PDF');
  }
  await writeFile(pending.filePath, bytes);
  return { filePath: pending.filePath };
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
