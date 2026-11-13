/** CSS pixels per PDF point before zoom. Two keeps small table type readable. */
const PDF_PIXELS_PER_POINT = 2;
/** Longest bitmap edge. Past this the page stays sharp and simply stops growing. */
const PDF_MAX_EDGE = 4500;

function screenRatio(pixelRatio: number): number {
  return Math.min(Math.max(pixelRatio, 1), 2);
}

/** Scale for a PDF page so the bitmap matches the screen and is not a stretched thumbnail. */
export function pdfPreviewScale(pageWidth: number, pageHeight: number, zoom: number, pixelRatio: number): number {
  const ratio = screenRatio(pixelRatio);
  const longest = Math.max(pageWidth, pageHeight, 1);
  const wanted = PDF_PIXELS_PER_POINT * zoom;
  const limit = PDF_MAX_EDGE / (longest * ratio);
  return Math.min(wanted, limit);
}

/** CSS width for an image: one file pixel per screen pixel, then the viewer zoom. */
export function imagePreviewWidth(naturalWidth: number, zoom: number, pixelRatio: number): number {
  const ratio = screenRatio(pixelRatio);
  return Math.max(1, Math.round((naturalWidth / ratio) * zoom));
}
