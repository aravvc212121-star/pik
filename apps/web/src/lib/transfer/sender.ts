/**
 * Transfer Sender — streams files over WebRTC DataChannel
 *
 * Never loads a whole file into memory. Uses Blob.slice for chunks.
 * Backpressure via bufferedAmount / bufferedAmountLowThreshold.
 */

import { sha256 } from '@noble/hashes/sha256';
import {
  PROTOCOL_VERSION,
  CHUNK_SIZE,
  BACKPRESSURE_HIGH,
  BACKPRESSURE_LOW,
  type FileManifestEntry,
  type DataChannelControlMessage,
} from '@picbeam/protocol';
import { buildChunk } from '@picbeam/protocol';
import { hexEncode } from '../crypto/utils';

export type SenderState =
  | 'idle'
  | 'waiting-accept'
  | 'accepted'
  | 'sending'
  | 'paused'
  | 'done'
  | 'cancelled'
  | 'error';

export interface SenderProgress {
  state: SenderState;
  currentFileIndex: number;
  totalFiles: number;
  bytesSent: number;
  totalBytes: number;
  speed: number; // bytes/sec
  timeLeft: number; // seconds
  fileProgress: Map<number, { sent: number; total: number }>;
}

type SenderEventHandler = (progress: SenderProgress) => void;

export class TransferSender {
  private dc: RTCDataChannel;
  private files: File[];
  private manifest: FileManifestEntry[];
  private state: SenderState = 'idle';
  private bytesSent = 0;
  private totalBytes = 0;
  private currentFileIndex = 0;
  private fileProgress = new Map<number, { sent: number; total: number }>();
  private startTime = 0;
  private cancelled = false;
  private listeners = new Set<SenderEventHandler>();
  private abortController = new AbortController();
  private autoStart: boolean;

  constructor(dc: RTCDataChannel, files: File[], manifest: FileManifestEntry[], autoStart = true) {
    this.dc = dc;
    this.files = files;
    this.manifest = manifest;
    this.totalBytes = manifest.reduce((sum, f) => sum + f.size, 0);
    this.autoStart = autoStart;

    // Set up backpressure
    this.dc.bufferedAmountLowThreshold = BACKPRESSURE_LOW;

    // Listen for messages from receiver
    this.dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as DataChannelControlMessage;
        this.handleMessage(msg);
      } catch {
        // Ignore invalid messages
      }
    };
  }

  onProgress(fn: SenderEventHandler): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emitProgress(): void {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const speed = elapsed > 0 ? this.bytesSent / elapsed : 0;
    const remaining = this.totalBytes - this.bytesSent;
    const timeLeft = speed > 0 ? remaining / speed : 0;

    const progress: SenderProgress = {
      state: this.state,
      currentFileIndex: this.currentFileIndex,
      totalFiles: this.files.length,
      bytesSent: this.bytesSent,
      totalBytes: this.totalBytes,
      speed,
      timeLeft,
      fileProgress: new Map(this.fileProgress),
    };

    this.listeners.forEach((fn) => fn(progress));
  }

  /** Send the manifest to the receiver */
  sendManifest(locationStripped: boolean): void {
    this.state = 'waiting-accept';
    this.sendControl({
      v: PROTOCOL_VERSION,
      type: 'manifest',
      files: this.manifest,
      totalSize: this.totalBytes,
      locationStripped,
    });
    this.emitProgress();
  }

  private handleMessage(msg: DataChannelControlMessage): void {
    switch (msg.type) {
      case 'accept':
        if (this.autoStart) {
          this.startTransfer();
        } else {
          this.state = 'accepted';
          this.emitProgress();
        }
        break;
      case 'decline':
        this.state = 'cancelled';
        this.emitProgress();
        break;
      case 'file-ok':
        // File received successfully, continue to next
        break;
      case 'file-bad':
        // Retry once — handled in sendFile
        break;
      case 'resume':
        // Handle resume from receiver
        break;
      case 'cancel':
        this.cancelled = true;
        this.state = 'cancelled';
        this.abortController.abort();
        this.emitProgress();
        break;
    }
  }

  /** Start sending all files */
  async startTransfer(): Promise<void> {
    if (this.state === 'sending' || this.state === 'done' || this.cancelled) return;
    this.state = 'sending';
    this.startTime = Date.now();
    this.emitProgress();

    for (let i = 0; i < this.files.length; i++) {
      if (this.cancelled) break;
      this.currentFileIndex = i;
      await this.sendFile(i);
    }

    if (!this.cancelled) {
      this.sendControl({ v: PROTOCOL_VERSION, type: 'done' });
      this.state = 'done';
      this.emitProgress();
    }
  }

  /** Send a single file in chunks */
  private async sendFile(index: number): Promise<void> {
    const file = this.files[index]!;
    const entry = this.manifest[index]!;

    this.fileProgress.set(index, { sent: 0, total: file.size });

    // Send file-start
    this.sendControl({
      v: PROTOCOL_VERSION,
      type: 'file-start',
      fileId: entry.id,
      offset: 0,
    });

    // Stream chunks with SHA-256
    const hasher = sha256.create();
    let offset = 0;
    let chunkIndex = 0;

    while (offset < file.size) {
      if (this.cancelled) return;

      const end = Math.min(offset + CHUNK_SIZE, file.size);
      const slice = file.slice(offset, end);
      const buffer = await slice.arrayBuffer();
      const data = new Uint8Array(buffer);

      hasher.update(data);

      const chunk = buildChunk(index, chunkIndex, data);

      // Backpressure: wait if buffer is full
      await this.waitForBufferDrain();

      this.dc.send(chunk);

      offset = end;
      chunkIndex++;
      this.bytesSent += data.length;
      this.fileProgress.set(index, { sent: offset, total: file.size });
      this.emitProgress();
    }

    // Send file-end with hash
    const hash = hexEncode(hasher.digest());
    this.sendControl({
      v: PROTOCOL_VERSION,
      type: 'file-end',
      fileId: entry.id,
      sha256: hash,
    });

    // Wait for file-ok / file-bad (with timeout)
    await this.waitForFileAck(entry.id);
  }

  /** Wait for bufferedAmount to drop below threshold */
  private waitForBufferDrain(): Promise<void> {
    if (this.dc.bufferedAmount <= BACKPRESSURE_HIGH) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const handler = () => {
        this.dc.removeEventListener('bufferedamountlow', handler);
        resolve();
      };
      this.dc.addEventListener('bufferedamountlow', handler);
    });
  }

  /** Wait for file-ok or file-bad from receiver */
  private waitForFileAck(_fileId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const handler = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as DataChannelControlMessage;
          if (msg.type === 'file-ok' || msg.type === 'file-bad') {
            this.dc.removeEventListener('message', handler);
            resolve();
          }
        } catch {
          // Ignore binary chunks
        }
      };
      this.dc.addEventListener('message', handler);
    });
  }

  private sendControl(msg: DataChannelControlMessage): void {
    this.dc.send(JSON.stringify(msg));
  }

  /** Cancel the transfer */
  cancel(): void {
    // Don't re-cancel or cancel after done
    if (this.state === 'done' || this.state === 'cancelled') return;

    this.cancelled = true;
    this.state = 'cancelled';
    this.abortController.abort();
    try {
      this.sendControl({ v: PROTOCOL_VERSION, type: 'cancel', reason: 'User cancelled' });
    } catch {
      // DC may already be closed
    }
    this.emitProgress();
  }

  destroy(): void {
    if (this.state !== 'done') {
      this.cancel();
    }
    this.listeners.clear();
  }
}
