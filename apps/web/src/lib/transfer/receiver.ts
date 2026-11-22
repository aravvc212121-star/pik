/**
 * Transfer Receiver — receives files over WebRTC DataChannel
 *
 * Writes chunks to OPFS (or in-memory fallback).
 * Verifies each file's size and SHA-256 on arrival.
 */

import { sha256 } from '@noble/hashes/sha256';
import {
  PROTOCOL_VERSION,
  type FileManifestEntry,
  type ManifestMessage,
  type DataChannelControlMessage,
  validateControlMessage,
  parseChunkHeader,
} from '@picbeam/protocol';
import { writeChunk, readFile, deleteFile } from '../opfs/index';
import { hexEncode } from '../crypto/utils';

export type ReceiverState =
  | 'idle'
  | 'consent'
  | 'receiving'
  | 'done'
  | 'cancelled'
  | 'error';

export interface FileStatus {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  received: number;
  status: 'waiting' | 'receiving' | 'done' | 'error';
}

export interface ReceiverProgress {
  state: ReceiverState;
  currentFileIndex: number;
  totalFiles: number;
  bytesReceived: number;
  totalBytes: number;
  speed: number;
  files: FileStatus[];
}

export type ReceiverEventHandler = {
  onManifest?: (files: FileManifestEntry[], totalSize: number, locationStripped: boolean) => void;
  onProgress?: (progress: ReceiverProgress) => void;
  onFileReceived?: (file: { name: string; blob: Blob; mimeType: string; index: number }) => void;
  onComplete?: (files: Array<{ name: string; blob: Blob; mimeType: string }>) => void;
  onError?: (error: Error) => void;
  onCancelled?: () => void;
};

export class TransferReceiver {
  private dc: RTCDataChannel;
  private manifest: FileManifestEntry[] = [];
  private totalSize = 0;
  private state: ReceiverState = 'idle';
  private bytesReceived = 0;
  private currentFileIndex = -1;
  private fileStatuses: FileStatus[] = [];
  private fileHashers = new Map<number, ReturnType<typeof sha256.create>>();
  private fileOffsets = new Map<number, number>();
  private startTime = 0;
  private handlers: ReceiverEventHandler;
  private receivedFiles: Array<{ name: string; blob: Blob; mimeType: string }> = [];
  private retryCount = new Map<string, number>();

  constructor(dc: RTCDataChannel, handlers: ReceiverEventHandler) {
    this.dc = dc;
    this.handlers = handlers;

    this.dc.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        this.handleChunk(event.data);
      } else {
        this.handleControl(event.data as string);
      }
    };
  }

  private handleControl(data: string): void {
    try {
      const parsed = JSON.parse(data);
      const msg = validateControlMessage(parsed);

      switch (msg.type) {
        case 'hello':
          // Server hello, nothing to do
          break;

        case 'manifest':
          this.handleManifest(msg as ManifestMessage);
          break;

        case 'file-start':
          this.handleFileStart(msg.fileId);
          break;

        case 'file-end':
          this.handleFileEnd(msg.fileId, msg.sha256);
          break;

        case 'cancel':
          this.state = 'cancelled';
          this.handlers.onCancelled?.();
          this.cleanup();
          break;

        case 'done':
          this.state = 'done';
          this.handlers.onComplete?.(this.receivedFiles);
          break;
      }
    } catch (err) {
      this.state = 'error';
      this.handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private handleManifest(msg: ManifestMessage): void {
    this.manifest = msg.files;
    this.totalSize = msg.totalSize;
    this.state = 'consent';

    this.fileStatuses = msg.files.map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      mimeType: f.mimeType,
      received: 0,
      status: 'waiting' as const,
    }));

    this.handlers.onManifest?.(msg.files, msg.totalSize, msg.locationStripped);
  }

  /** User accepted the transfer */
  accept(): void {
    this.state = 'receiving';
    this.startTime = Date.now();
    this.sendControl({ v: PROTOCOL_VERSION, type: 'accept' });
    this.emitProgress();
  }

  /** User declined the transfer */
  decline(): void {
    this.state = 'cancelled';
    this.sendControl({ v: PROTOCOL_VERSION, type: 'decline' });
    this.cleanup();
  }

  private handleFileStart(fileId: string): void {
    const idx = this.manifest.findIndex((f) => f.id === fileId);
    if (idx === -1) return;

    this.currentFileIndex = idx;
    this.fileStatuses[idx]!.status = 'receiving';
    this.fileHashers.set(idx, sha256.create());
    this.fileOffsets.set(idx, 0);
    this.emitProgress();
  }

  private handleChunk(buffer: ArrayBuffer): void {
    try {
      const { fileIndex, data } = parseChunkHeader(buffer);

      if (fileIndex >= this.manifest.length) return;

      const offset = this.fileOffsets.get(fileIndex) ?? 0;

      // Write to OPFS
      const fileId = this.manifest[fileIndex]!.id;
      writeChunk(fileId, offset, data);

      // Update hasher
      const hasher = this.fileHashers.get(fileIndex);
      if (hasher) hasher.update(data);

      // Update progress
      const newOffset = offset + data.byteLength;
      this.fileOffsets.set(fileIndex, newOffset);
      this.bytesReceived += data.byteLength;

      const status = this.fileStatuses[fileIndex];
      if (status) {
        status.received = newOffset;
      }

      this.emitProgress();
    } catch (err) {
      this.state = 'error';
      this.handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async handleFileEnd(fileId: string, expectedHash: string): Promise<void> {
    const idx = this.manifest.findIndex((f) => f.id === fileId);
    if (idx === -1) return;

    const hasher = this.fileHashers.get(idx);
    if (!hasher) return;

    const actualHash = hexEncode(hasher.digest());
    const entry = this.manifest[idx]!;
    const offset = this.fileOffsets.get(idx) ?? 0;

    // Verify size
    if (offset !== entry.size) {
      const retries = this.retryCount.get(fileId) ?? 0;
      if (retries < 1) {
        this.retryCount.set(fileId, retries + 1);
        this.sendControl({ v: PROTOCOL_VERSION, type: 'file-bad', fileId, reason: 'Size mismatch' });
        return;
      }
      this.fileStatuses[idx]!.status = 'error';
      this.sendControl({ v: PROTOCOL_VERSION, type: 'file-bad', fileId, reason: 'Size mismatch after retry' });
      this.emitProgress();
      return;
    }

    // Verify hash
    if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
      const retries = this.retryCount.get(fileId) ?? 0;
      if (retries < 1) {
        this.retryCount.set(fileId, retries + 1);
        this.fileHashers.set(idx, sha256.create());
        this.fileOffsets.set(idx, 0);
        await deleteFile(fileId);
        this.sendControl({ v: PROTOCOL_VERSION, type: 'file-bad', fileId, reason: 'Hash mismatch' });
        return;
      }
      this.fileStatuses[idx]!.status = 'error';
      this.sendControl({ v: PROTOCOL_VERSION, type: 'file-bad', fileId, reason: 'Hash mismatch after retry' });
      this.emitProgress();
      return;
    }

    // Success
    this.fileStatuses[idx]!.status = 'done';
    const rawBlob = await readFile(fileId);
    // Re-wrap with the correct MIME type so the browser can render it
    const blob = new Blob([rawBlob], { type: entry.mimeType || 'image/jpeg' });
    const fileItem = {
      name: entry.name,
      blob,
      mimeType: entry.mimeType,
    };
    this.receivedFiles.push(fileItem);
    this.handlers.onFileReceived?.({ ...fileItem, index: idx });

    this.sendControl({ v: PROTOCOL_VERSION, type: 'file-ok', fileId });
    this.emitProgress();
  }

  private emitProgress(): void {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const speed = elapsed > 0 ? this.bytesReceived / elapsed : 0;

    const progress: ReceiverProgress = {
      state: this.state,
      currentFileIndex: this.currentFileIndex,
      totalFiles: this.manifest.length,
      bytesReceived: this.bytesReceived,
      totalBytes: this.totalSize,
      speed,
      files: [...this.fileStatuses],
    };

    this.handlers.onProgress?.(progress);
  }

  private sendControl(msg: DataChannelControlMessage): void {
    try {
      this.dc.send(JSON.stringify(msg));
    } catch {
      // DC may be closed
    }
  }

  /** Cancel the transfer */
  cancel(): void {
    this.state = 'cancelled';
    try {
      this.sendControl({ v: PROTOCOL_VERSION, type: 'cancel', reason: 'User cancelled' });
    } catch {
      // DC may be closed
    }
    this.cleanup();
    this.handlers.onCancelled?.();
  }

  private async cleanup(): Promise<void> {
    // Delete all temp files
    for (const entry of this.manifest) {
      await deleteFile(entry.id);
    }
    this.fileHashers.clear();
    this.fileOffsets.clear();
  }

  destroy(): void {
    this.cleanup();
  }
}
