/**
 * Origin Private File System (OPFS) wrapper for temporary file storage
 * Falls back to in-memory storage when OPFS is unavailable
 */

const PICBEAM_DIR = '.picbeam-temp';

/** Check if OPFS is available */
export function hasOPFS(): boolean {
  return typeof navigator !== 'undefined' && 'storage' in navigator && 'getDirectory' in navigator.storage;
}

let opfsDir: FileSystemDirectoryHandle | null = null;

async function getDir(): Promise<FileSystemDirectoryHandle> {
  if (opfsDir) return opfsDir;
  const root = await navigator.storage.getDirectory();
  opfsDir = await root.getDirectoryHandle(PICBEAM_DIR, { create: true });
  return opfsDir;
}

// ── In-memory fallback ──
const memoryStore = new Map<string, Uint8Array[]>();
let memoryWarningShown = false;

function getMemoryChunks(fileId: string): Uint8Array[] {
  let chunks = memoryStore.get(fileId);
  if (!chunks) {
    chunks = [];
    memoryStore.set(fileId, chunks);
  }
  return chunks;
}

// ── Public API ──

/** Write a chunk at a given offset */
export async function writeChunk(
  fileId: string,
  offset: number,
  data: Uint8Array
): Promise<void> {
  if (hasOPFS()) {
    try {
      const dir = await getDir();
      const fileHandle = await dir.getFileHandle(fileId, { create: true });
      const writable = await fileHandle.createWritable({ keepExistingData: true });
      await writable.seek(offset);
      await writable.write(data);
      await writable.close();
      return;
    } catch {
      // Fall through to memory
    }
  }

  // Memory fallback
  if (!memoryWarningShown) {
    console.warn('PicBeam: OPFS unavailable, using in-memory storage. Large files may cause issues.');
    memoryWarningShown = true;
  }
  const chunks = getMemoryChunks(fileId);
  // Simple append (assumes sequential writes)
  chunks.push(new Uint8Array(data));
}

/** Read a complete file as Blob */
export async function readFile(fileId: string): Promise<Blob> {
  if (hasOPFS()) {
    try {
      const dir = await getDir();
      const fileHandle = await dir.getFileHandle(fileId);
      const file = await fileHandle.getFile();
      return file;
    } catch {
      // Fall through to memory
    }
  }

  const chunks = memoryStore.get(fileId);
  if (!chunks || chunks.length === 0) {
    throw new Error(`File not found: ${fileId}`);
  }
  return new Blob(chunks);
}

/** Delete a temporary file */
export async function deleteFile(fileId: string): Promise<void> {
  // Memory cleanup
  memoryStore.delete(fileId);

  if (hasOPFS()) {
    try {
      const dir = await getDir();
      await dir.removeEntry(fileId);
    } catch {
      // File may not exist, that's fine
    }
  }
}

/** Delete all PicBeam temp files (orphan cleanup at app start) */
export async function cleanupAll(): Promise<void> {
  memoryStore.clear();

  if (hasOPFS()) {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(PICBEAM_DIR, { recursive: true });
      opfsDir = null;
    } catch {
      // Directory may not exist
    }
  }
}

/** Get total size of in-memory chunks (for warning) */
export function getMemoryUsage(): number {
  let total = 0;
  for (const chunks of memoryStore.values()) {
    for (const chunk of chunks) {
      total += chunk.byteLength;
    }
  }
  return total;
}
