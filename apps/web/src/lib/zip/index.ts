/**
 * ZIP, download and Web Share helpers
 */

import { downloadZip } from 'client-zip';

interface FileEntry {
  name: string;
  blob: Blob;
}

/** Create a ZIP blob from files */
export async function createZip(files: FileEntry[]): Promise<Blob> {
  const entries = files.map((f) => ({
    name: f.name,
    input: f.blob,
    lastModified: new Date(),
  }));

  const zipBlob = await downloadZip(entries).blob();
  return zipBlob;
}

/** Trigger a browser download for a blob */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Clean up after a tick
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 100);
}

/** Check if Web Share API with files is supported */
export function canShareFiles(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'share' in navigator &&
    'canShare' in navigator
  );
}

/** Share files using Web Share API */
export async function shareFiles(files: File[]): Promise<boolean> {
  if (!canShareFiles()) return false;

  try {
    const shareData = { files };
    if (navigator.canShare(shareData)) {
      await navigator.share(shareData);
      return true;
    }
  } catch (err) {
    // User cancelled or not supported
    if (err instanceof Error && err.name === 'AbortError') {
      return false;
    }
  }
  return false;
}

/** Download individual files one by one */
export function downloadFiles(files: FileEntry[]): void {
  files.forEach((f, i) => {
    setTimeout(() => downloadBlob(f.blob, f.name), i * 200);
  });
}
