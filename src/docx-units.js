// Measures of a Word document, the part that needs no browser: the sizes of the pages, the conversions
// between the units of the document (mm, pt, px) and those of OOXML (twips, half-points, EMU), and the
// fitting of a drawing in a box. Shared with the tests.
import { PAGE_HEIGHT_MM } from './schema.js';

// Widths in mm of the page sizes the studio offers; the heights live in PAGE_HEIGHT_MM.
export const PAGE_WIDTH_MM = { A4: 210, A5: 148, Letter: 215.9 };

// One inch is 25.4 mm, 72 pt, 96 px, 1440 twips and 914400 EMU.
export const twips = mm => Math.round((mm * 1440) / 25.4);
export const halfPoints = pt => Math.round(pt * 2);
export const emu = px => Math.round(px * 9525);
export const pxOfMm = mm => (mm * 96) / 25.4;
export const mmOfPx = px => (px * 25.4) / 96;

// The page of the document in mm: its size, its margins and the box of the text.
export function pageGeometry({ pageSize, marginTop, marginRight, marginBottom, marginLeft }) {
  const width = PAGE_WIDTH_MM[pageSize] ?? PAGE_WIDTH_MM.A4;
  const height = PAGE_HEIGHT_MM[pageSize] ?? PAGE_HEIGHT_MM.A4;
  const column = Math.max(20, width - marginLeft - marginRight);
  const textHeight = Math.max(20, height - marginTop - marginBottom);
  return { width, height, marginTop, marginRight, marginBottom, marginLeft, column, textHeight };
}

// The width in px a drawing is shown at when its source asks for `wanted` (a share of the column, "60%",
// or a size in mm, "50mm"), in a column of `columnPx` px; null when nothing (or nothing readable) is asked.
export function wantedWidth(wanted, columnPx) {
  const percent = /^(\d+(?:\.\d+)?)%$/.exec(wanted ?? '');
  const mm = /^(\d+(?:\.\d+)?)mm$/.exec(wanted ?? '');
  if (percent) return (columnPx * Number(percent[1])) / 100;
  if (mm) return pxOfMm(Number(mm[1]));
  return null;
}

// The size in px of a drawing of `width` × `height` px shown at `wanted` (a share of the column, "60%", a
// size in mm, "50mm", or nothing for its natural size), never wider than the column nor taller than the
// text area less `reserve` (all in mm), its proportions kept.
export function fitDrawing({ width, height }, wanted, { column, textHeight }, { reserve = 12 } = {}) {
  const ratio = width > 0 && height > 0 ? height / width : 0.75;
  const columnPx = pxOfMm(column);
  let target = wantedWidth(wanted, columnPx) ?? (width > 0 ? width : columnPx);
  target = Math.min(target, columnPx);
  const maxHeight = pxOfMm(Math.max(1, textHeight - reserve));
  if (target * ratio > maxHeight) target = Math.floor(maxHeight / ratio);
  const fitted = Math.max(1, Math.round(target));
  return { width: fitted, height: Math.max(1, Math.round(fitted * ratio)) };
}
