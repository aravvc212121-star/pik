/**
 * PicBeam App State — central state management with Preact signals-style hooks
 */

import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import type { FileManifestEntry } from '@picbeam/protocol';
import type { FileStatus } from '../lib/transfer/index';

// ── Types ──

export type AppScreen =
  | 'send-pick'
  | 'send-waiting'
  | 'send-transferring'
  | 'send-done'
  | 'flick-ready'
  | 'mid-throw'
  | 'receive-scanner'
  | 'receive-consent'
  | 'receive-transferring'
  | 'receive-done'
  | 'catch-waiting'
  | 'catching'
  | 'error';

export interface TransferProgress {
  bytesSent: number;
  totalBytes: number;
  speed: number;
  timeLeft: number;
  currentFile: number;
  totalFiles: number;
  fileStatuses: FileStatus[];
}

export interface ReceivedFile {
  name: string;
  blob: Blob;
  mimeType: string;
  objectUrl?: string;
}

export interface AppState {
  activeTab: 'send' | 'receive';
  screen: AppScreen;
  privateSheetOpen: boolean;
  removeLocation: boolean;
  hideIp: boolean;

  // Send state
  selectedFiles: File[];
  selectedThumbnails: string[];
  sessionId: string | null;
  secret: string | null;
  qrUrl: string | null;
  code: string | null;
  connectionState: 'waiting' | 'connected' | 'transferring' | 'done';

  // Receive state
  manifest: FileManifestEntry[] | null;
  manifestTotalSize: number;
  locationStripped: boolean;

  // Transfer progress
  progress: TransferProgress | null;

  // Received files
  receivedFiles: ReceivedFile[];

  // Error
  errorTitle: string;
  errorMessage: string;
  errorAction: string;

  // SAS words
  sasWords: [string, string, string, string] | null;
}

const defaultState: AppState = {
  activeTab: 'send',
  screen: 'send-pick',
  privateSheetOpen: false,
  removeLocation: true,
  hideIp: false,
  selectedFiles: [],
  selectedThumbnails: [],
  sessionId: null,
  secret: null,
  qrUrl: null,
  code: null,
  connectionState: 'waiting',
  manifest: null,
  manifestTotalSize: 0,
  locationStripped: false,
  progress: null,
  receivedFiles: [],
  errorTitle: '',
  errorMessage: '',
  errorAction: '',
  sasWords: null,
};

/** Load persisted settings from localStorage */
function loadSettings(): Partial<AppState> {
  try {
    const removeLocation = localStorage.getItem('picbeam:removeLocation');
    const hideIp = localStorage.getItem('picbeam:hideIp');
    return {
      removeLocation: removeLocation !== 'false',
      hideIp: hideIp === 'true',
    };
  } catch {
    return {};
  }
}

/** Save settings to localStorage */
function saveSettings(state: Pick<AppState, 'removeLocation' | 'hideIp'>): void {
  try {
    localStorage.setItem('picbeam:removeLocation', String(state.removeLocation));
    localStorage.setItem('picbeam:hideIp', String(state.hideIp));
  } catch {
    // localStorage not available
  }
}

export function useAppState() {
  const [state, setState] = useState<AppState>(() => ({
    ...defaultState,
    ...loadSettings(),
  }));

  const thumbnailUrls = useRef<string[]>([]);

  // Revoke old object URLs when thumbnails change
  useEffect(() => {
    return () => {
      thumbnailUrls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const update = useCallback((partial: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const setTab = useCallback((tab: 'send' | 'receive') => {
    const screen = tab === 'send' ? 'send-pick' : 'receive-scanner';
    update({ activeTab: tab, screen });
  }, [update]);

  const setFiles = useCallback((files: File[]) => {
    // Revoke old URLs
    thumbnailUrls.current.forEach((url) => URL.revokeObjectURL(url));

    // Create new thumbnails
    const urls = files.slice(0, 12).map((f) => URL.createObjectURL(f));
    thumbnailUrls.current = urls;

    update({
      selectedFiles: files,
      selectedThumbnails: urls,
      screen: files.length > 0 ? 'send-waiting' : 'send-pick',
    });
  }, [update]);

  const setRemoveLocation = useCallback((v: boolean) => {
    update({ removeLocation: v });
    saveSettings({ removeLocation: v, hideIp: state.hideIp });
  }, [update, state.hideIp]);

  const setHideIp = useCallback((v: boolean) => {
    update({ hideIp: v });
    saveSettings({ removeLocation: state.removeLocation, hideIp: v });
  }, [update, state.removeLocation]);

  const setError = useCallback((title: string, message: string, action: string) => {
    update({
      screen: 'error',
      errorTitle: title,
      errorMessage: message,
      errorAction: action,
    });
  }, [update]);

  const reset = useCallback(() => {
    thumbnailUrls.current.forEach((url) => URL.revokeObjectURL(url));
    thumbnailUrls.current = [];
    setState((prev) => ({
      ...defaultState,
      removeLocation: prev.removeLocation,
      hideIp: prev.hideIp,
      activeTab: prev.activeTab,
      screen: prev.activeTab === 'send' ? 'send-pick' : 'receive-scanner',
    }));
  }, []);

  /** Remove a file by index; if none left, go back to send-pick */
  const removeFile = useCallback((index: number) => {
    setState((prev) => {
      const files = prev.selectedFiles.filter((_, i) => i !== index);
      // Revoke the removed thumbnail
      if (prev.selectedThumbnails[index]) {
        URL.revokeObjectURL(prev.selectedThumbnails[index]);
      }
      const thumbs = prev.selectedThumbnails.filter((_, i) => i !== index);
      thumbnailUrls.current = thumbs;
      return {
        ...prev,
        selectedFiles: files,
        selectedThumbnails: thumbs,
        screen: files.length > 0 ? prev.screen : 'send-pick' as AppScreen,
      };
    });
  }, []);

  /** Add more files to the existing selection */
  const addFiles = useCallback((newFiles: File[]) => {
    setState((prev) => {
      const combined = [...prev.selectedFiles, ...newFiles];
      // Create thumbnails only for new files that fit within the display limit
      const existingCount = prev.selectedThumbnails.length;
      const maxThumbs = 12;
      const slotsLeft = Math.max(0, maxThumbs - existingCount);
      const newUrls = newFiles.slice(0, slotsLeft).map((f) => URL.createObjectURL(f));
      const thumbs = [...prev.selectedThumbnails, ...newUrls];
      thumbnailUrls.current = thumbs;
      return {
        ...prev,
        selectedFiles: combined,
        selectedThumbnails: thumbs,
      };
    });
  }, []);

  return {
    state,
    update,
    setTab,
    setFiles,
    removeFile,
    addFiles,
    setRemoveLocation,
    setHideIp,
    setError,
    reset,
  };
}

/** Format bytes to human readable */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

/** Format seconds to human readable time */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `about ${Math.ceil(seconds)} s left`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return `about ${mins} min ${secs} s left`;
}

/** Format speed to human readable */
export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}
