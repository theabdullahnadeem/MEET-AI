// C.6 exports: tiny client-side file-download helpers (browser only — do not
// call from server code).

/** Strip characters that are unsafe in filenames across platforms. */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "meeting";
}

/** Trigger a browser download of a generated text file. */
export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = "text/plain",
): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
