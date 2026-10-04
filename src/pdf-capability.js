// Can this browser draw the pages of the preview into a PDF? "PDF with project" renders each page as an
// SVG image (the HTML of the page inside a `foreignObject`) on a canvas, then reads the canvas back. Some
// engines refuse that last step: a canvas that drew such an image is "tainted" and cannot be read. The
// answer is found once at startup, with a tiny image, so that a click on Export knows it at once and can
// open the print window inside the user gesture instead. Never stored: a browser update changes it.

const PROBE_TIMEOUT_MS = 2000;
const SIZE = 4;

let drawing = null; // true, false, or null while the probe runs

// Draws a small green box through the same path as the pages and reads one pixel back.
export async function probePageDrawing() {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">` +
    `<foreignObject width="${SIZE}" height="${SIZE}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${SIZE}px;height:${SIZE}px;background:#00ff00"></div>` +
    '</foreignObject></svg>';
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), PROBE_TIMEOUT_MS);
      image.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      image.onerror = () => {
        clearTimeout(timer);
        reject(new Error('image'));
      };
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    // Throws a SecurityError on a tainted canvas; a blank pixel means the content was not drawn at all.
    const [red, green, , alpha] = context.getImageData(1, 1, 1, 1).data;
    drawing = alpha > 200 && green > 200 && red < 60;
  } catch {
    drawing = false;
  }
  return drawing;
}

// true or false once the probe has answered, null before.
export const canDrawPages = () => drawing;

// An export failed while drawing: the rest of the session uses the print dialog.
export function markCannotDraw() {
  drawing = false;
}
