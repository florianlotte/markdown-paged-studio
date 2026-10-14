// The image library of the sidebar (the list, the uploads, the missing names) and what it writes into the
// editor: a reference at the cursor for an image inserted from the list, dropped, pasted or chosen from the
// Insert menu.
import { addImageFiles, findImage, listImages, missingImages, onImagesChange, removeImage } from './images.js';
import { insertBlock } from './editor.js';
import { t } from './i18n.js';
import { guarded } from './notices.js';
import { revealEditor } from './view.js';

// ---- Images: uploaded files are matched to the Markdown by file name (see images.js).

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Markdown for an image: the name only, with the characters a link destination cannot hold escaped.
function imageReference(name) {
  const alt = name.replace(/\.[^.]+$/, '');
  const destination = encodeURI(name).replace(/\(/g, '%28').replace(/\)/g, '%29');
  return `![${alt}](${destination})`;
}

// Inserts a block at the cursor of the editor, shown first when the preview was alone.
export function insertIntoEditor(text) {
  revealEditor();
  insertBlock(text);
}

// Image files dropped on the editor or pasted into it are added to the library and referenced at the cursor.
export function addEditorImages(files, kind) {
  if (kind === 'drop') {
    addImages(files, { insert: true });
    return;
  }
  // Clipboard images are all called "image.png": give each paste its own name.
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  addImages(files, {
    insert: true,
    rename: file => `pasted-${stamp}.${file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'}`,
  });
}

function reportImages(results) {
  const status = document.getElementById('imagesStatus');
  status.textContent = results
    .map(result => {
      if (result.error) return t('{name}: {error}.', { name: result.name, error: t(result.error) });
      return t(result.resized ? '{name} added, scaled down to {width} px wide.' : '{name} added.', result);
    })
    .join(' ');
  status.hidden = results.length === 0;
  status.classList.toggle(
    'is-error',
    results.some(result => result.error),
  );
}

async function addImages(files, { insert = false, rename } = {}) {
  const images = [...files].filter(file => file.type.startsWith('image/'));
  if (!images.length) return;
  const results = await addImageFiles(images, { rename });
  reportImages(results);
  if (insert) {
    const added = results.filter(result => !result.error).map(result => imageReference(result.name));
    if (added.length) insertIntoEditor(added.join('\n\n'));
  }
}

function imageListItem(image) {
  const item = document.createElement('li');
  const thumb = document.createElement('img');
  thumb.className = 'image-thumb';
  thumb.src = image.dataUrl;
  thumb.alt = '';
  const text = document.createElement('div');
  text.className = 'image-text';
  const name = document.createElement('span');
  name.className = 'image-name';
  name.textContent = image.name;
  name.title = image.name;
  const details = document.createElement('span');
  details.className = 'image-details';
  const size = image.width && image.height ? `${image.width} × ${image.height} · ` : '';
  details.textContent = `${size}${formatBytes(image.bytes)}${image.builtin ? t(' · built in') : ''}`;
  text.append(name, details);
  const insert = document.createElement('button');
  insert.type = 'button';
  insert.className = 'secondary';
  insert.textContent = t('Insert');
  insert.title = t('Insert {name} at the cursor', image);
  insert.addEventListener('click', () => insertIntoEditor(imageReference(image.name)));
  item.append(thumb, text, insert);
  if (!image.builtin) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary';
    remove.textContent = t('Remove');
    remove.title = t('Remove {name}', image);
    remove.addEventListener('click', () => removeImage(image.key));
    item.append(remove);
  }
  return item;
}

function missingListItem(name) {
  const item = document.createElement('li');
  item.className = 'is-missing';
  const text = document.createElement('div');
  text.className = 'image-text';
  const label = document.createElement('span');
  label.className = 'image-name';
  label.textContent = name;
  const details = document.createElement('span');
  details.className = 'image-details';
  details.textContent = t('Used in the document, not uploaded yet');
  text.append(label, details);
  item.append(text);
  return item;
}

export function renderImageList() {
  const list = document.getElementById('imageList');
  // The missing names come from the last render: drop those uploaded since.
  const missing = missingImages().filter(name => !findImage(name));
  list.replaceChildren(...missing.map(missingListItem), ...listImages().map(imageListItem));
}

// Insert → Image…: the files chosen next are referenced at the cursor as well as added to the library.
let insertChosenImages = false;
export function chooseImagesToInsert() {
  insertChosenImages = true;
  document.getElementById('imageFiles').click();
}

export function bindImages() {
  const input = document.getElementById('imageFiles');
  document.getElementById('addImages').addEventListener('click', () => input.click());
  input.addEventListener(
    'change',
    guarded(async () => {
      const insert = insertChosenImages;
      insertChosenImages = false;
      await addImages(input.files, { insert });
      input.value = '';
    }, 'Images could not be added: {error}'),
  );

  onImagesChange(renderImageList);
  renderImageList();
}
