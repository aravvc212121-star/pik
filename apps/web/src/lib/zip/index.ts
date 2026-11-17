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

export type ShareResult = 'success' | 'cancelled' | 'fallback';

/** Ensure a file has a valid, standard image/video MIME type */
export function ensureValidMimeType(name: string, mime?: string): string {
  if (mime && mime.includes('/') && mime !== 'application/octet-stream') {
    return mime;
  }
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    heic: 'image/heic',
    heif: 'image/heif',
    avif: 'image/avif',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
  };
  return map[ext] || 'image/jpeg';
}

/** Check if Web Share API with files is supported */
export function canShareFiles(files?: File[]): boolean {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.share !== 'function' ||
    typeof navigator.canShare !== 'function'
  ) {
    return false;
  }
  if (files && files.length > 0) {
    try {
      const cleanFiles = files.map((f, i) => {
        const type = ensureValidMimeType(f.name, f.type);
        return new File([f], f.name || `photo-${i + 1}.jpg`, { type });
      });
      return navigator.canShare({ files: cleanFiles });
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Share files using Web Share API.
 * Opens the phone's native system save/share sheet (Photos, Gallery, Quick Share, Save Image).
 * - 'success': Native sharing was completed.
 * - 'cancelled': User dismissed/cancelled the native share sheet (do not trigger download).
 * - 'fallback': Web share unsupported or failed with an error other than user cancellation.
 */
export async function shareFiles(files: File[]): Promise<ShareResult> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return 'fallback';
  }

  // Normalize files with valid image/video MIME types and non-empty names
  const cleanFiles = files.map((f, i) => {
    const validMime = ensureValidMimeType(f.name, f.type);
    let name = f.name || `photo-${i + 1}.jpg`;
    if (!name.includes('.')) {
      const ext = validMime.split('/')[1] || 'jpg';
      name = `${name}.${ext}`;
    }
    return new File([f], name, {
      type: validMime,
      lastModified: f.lastModified || Date.now(),
    });
  });

  // Try sharing all clean files
  try {
    const shareData = {
      files: cleanFiles,
      title:
        cleanFiles.length === 1
          ? cleanFiles[0]?.name
          : `${cleanFiles.length} photos`,
    };
    if (navigator.canShare && navigator.canShare(shareData)) {
      await navigator.share(shareData);
      return 'success';
    }
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === 'AbortError' ||
        (err.name === 'NotAllowedError' &&
          err.message.toLowerCase().includes('cancel')))
    ) {
      return 'cancelled';
    }
  }

  // If sharing multiple files together wasn't supported (some devices only allow 1 file),
  // and there is 1 file, try that single file
  if (cleanFiles.length === 1) {
    try {
      const singleData = {
        files: [cleanFiles[0]!],
        title: cleanFiles[0]?.name,
      };
      if (navigator.canShare && navigator.canShare(singleData)) {
        await navigator.share(singleData);
        return 'success';
      }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === 'AbortError' ||
          (err.name === 'NotAllowedError' &&
            err.message.toLowerCase().includes('cancel')))
      ) {
        return 'cancelled';
      }
    }
  }

  return 'fallback';
}

/** Download individual files one by one */
export function downloadFiles(files: FileEntry[]): void {
  files.forEach((f, i) => {
    setTimeout(() => downloadBlob(f.blob, f.name), i * 200);
  });
}
