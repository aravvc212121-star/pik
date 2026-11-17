/**
 * JPEG Exif GPS Stripper
 *
 * Removes GPS IFD from JPEG Exif data without re-encoding pixels.
 * Preserves orientation tag. Only modifies JPEG files.
 */

const JPEG_SOI = 0xffd8;
const APP1_MARKER = 0xffe1;
const EXIF_HEADER = 'Exif\x00\x00';
const GPS_TAG = 0x8825;
const ORIENTATION_TAG = 0x0112;

/** Check if blob is a JPEG */
export async function isJpeg(blob: Blob): Promise<boolean> {
  if (blob.size < 2) return false;
  const header = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  return header[0] === 0xff && header[1] === 0xd8;
}

/** Strip GPS data from JPEG Exif without re-encoding pixels */
export async function stripGpsFromJpeg(blob: Blob): Promise<Blob> {
  if (!(await isJpeg(blob))) return blob;

  const buffer = await blob.arrayBuffer();
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Find APP1 (Exif) marker
  let offset = 2; // Skip SOI
  while (offset < data.length - 4) {
    const marker = view.getUint16(offset, false);

    if (marker === APP1_MARKER) {
      const segLen = view.getUint16(offset + 2, false);
      const segStart = offset + 4;

      // Check for Exif header
      const headerStr = String.fromCharCode(...data.slice(segStart, segStart + 6));
      if (headerStr === EXIF_HEADER) {
        const tiffStart = segStart + 6;

        // Determine byte order
        const byteOrder = view.getUint16(tiffStart, false);
        const littleEndian = byteOrder === 0x4949; // 'II'

        // Verify TIFF magic
        const magic = view.getUint16(tiffStart + 2, littleEndian);
        if (magic !== 42) return blob; // Not valid TIFF, return unchanged

        // Get IFD0 offset
        const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);
        const ifd0Start = tiffStart + ifd0Offset;

        if (ifd0Start >= data.length - 2) return blob;

        const entryCount = view.getUint16(ifd0Start, littleEndian);
        let gpsFound = false;

        // Clone the data for modification
        const modified = new Uint8Array(data);
        const modView = new DataView(modified.buffer);

        // Scan IFD0 entries for GPS IFD pointer
        for (let i = 0; i < entryCount; i++) {
          const entryOffset = ifd0Start + 2 + i * 12;
          if (entryOffset + 12 > data.length) break;

          const tag = view.getUint16(entryOffset, littleEndian);

          if (tag === GPS_TAG) {
            // Zero out the GPS IFD pointer
            // Set tag to 0 (effectively removing the entry)
            // We zero the value (the pointer to GPS IFD)
            modView.setUint32(entryOffset + 8, 0, littleEndian);
            gpsFound = true;

            // Also try to zero out the GPS IFD data it points to
            const gpsIfdOffset = view.getUint32(entryOffset + 8, littleEndian);
            if (gpsIfdOffset > 0) {
              const gpsIfdStart = tiffStart + gpsIfdOffset;
              if (gpsIfdStart < data.length - 2) {
                const gpsEntryCount = view.getUint16(gpsIfdStart, littleEndian);
                const gpsDataLen = 2 + gpsEntryCount * 12 + 4;
                const endPos = Math.min(gpsIfdStart + gpsDataLen, data.length);
                modified.fill(0, gpsIfdStart, endPos);
              }
            }
          }
        }

        if (gpsFound) {
          return new Blob([modified], { type: blob.type || 'image/jpeg' });
        }
      }

      offset += 2 + segLen;
      continue;
    }

    // If we hit SOS (Start of Scan) or another non-APP marker, stop
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;

    // Skip this marker segment
    if (offset + 2 < data.length) {
      const len = view.getUint16(offset + 2, false);
      offset += 2 + len;
    } else {
      break;
    }
  }

  return blob; // No GPS data found, return unchanged
}
