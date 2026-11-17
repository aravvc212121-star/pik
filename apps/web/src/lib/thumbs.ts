/**
 * PicBeam — local thumbnail generation
 *
 * Uses createImageBitmap for photos and video poster frames.
 * Lazy, capped at THUMB_SIZE px, revokes URLs when done.
 */

import { THUMB_SIZE } from './motion';

/** Map of objectUrls we created so we can revoke them */
const activeUrls = new Set<string>();

/**
 * Generate a thumbnail URL from a File or Blob.
 * Returns an object URL to a resized image.
 */
export async function generateThumbnail(source: File | Blob): Promise<string> {
  const mimeType = source instanceof File ? source.type : source.type;
  const isVideo = mimeType.startsWith('video/');

  let bitmap: ImageBitmap;

  if (isVideo) {
    bitmap = await videoThumbnail(source);
  } else {
    bitmap = await createImageBitmap(source, {
      resizeWidth: THUMB_SIZE,
      resizeQuality: 'medium',
    });
  }

  // Draw to canvas to get a blob
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
  const url = URL.createObjectURL(blob);
  activeUrls.add(url);
  return url;
}

/**
 * Generate a thumbnail from a video by grabbing the first frame.
 */
async function videoThumbnail(source: File | Blob): Promise<ImageBitmap> {
  return new Promise<ImageBitmap>((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';

    const url = URL.createObjectURL(source);

    video.onloadeddata = () => {
      // Seek to 0.1s for a usable frame
      video.currentTime = 0.1;
    };

    video.onseeked = async () => {
      try {
        const bmp = await createImageBitmap(video, {
          resizeWidth: THUMB_SIZE,
          resizeQuality: 'medium',
        });
        resolve(bmp);
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
        video.remove();
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      video.remove();
      reject(new Error('Failed to load video for thumbnail'));
    };

    video.src = url;
  });
}

/**
 * Revoke a thumbnail URL we created.
 */
export function revokeThumbnail(url: string): void {
  if (activeUrls.has(url)) {
    URL.revokeObjectURL(url);
    activeUrls.delete(url);
  }
}

/**
 * Revoke all active thumbnail URLs.
 */
export function revokeAllThumbnails(): void {
  for (const url of activeUrls) {
    URL.revokeObjectURL(url);
  }
  activeUrls.clear();
}
