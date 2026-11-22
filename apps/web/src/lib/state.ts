/**
 * PicBeam App State — central state management with Preact hooks
 *
 * Rewritten for the new Session interface and screen-based navigation
 * (no more tabs).
 */

import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import type { Session, ReceivedFileData, TransferProgress, FileInfo } from '../session';

// ── Screen Names ──

export type AppScreen =
  | 'home'
  | 'picking'
  | 'code-ready'
  | 'verify-words-sender'
  | 'verify-words-receiver'
  | 'flick-ready'
  | 'sending'
  | 'sent'
  | 'enter-code'
  | 'accept'
  | 'waiting-for-throw'
  | 'catching'
  | 'received'
  | 'error';

// ── Re-export ReceivedFileData as the canonical received-file type ──

export type { ReceivedFileData, TransferProgress, FileInfo };

// ── App State ──

export interface AppState {
  screen: AppScreen;
  privateSheetOpen: boolean;
  removeLocation: boolean;
  hideIp: boolean;

  // Send state
  selectedFiles: File[];
  selectedThumbnails: string[];
  code: string | null;
  expiresAt: number | null;

  // Verification
  words: [string, string, string, string] | null;

  // Receive state
  manifest: FileInfo[] | null;
  manifestTotalSize: number;

  // Transfer progress
  progress: TransferProgress | null;

  // Received files
  receivedFiles: ReceivedFileData[];

  // Error
  errorTitle: string;
  errorMessage: string;
  errorAction: string;
  errorCanRetry: boolean;
}

const defaultState: AppState = {
  screen: 'home',
  privateSheetOpen: false,
  removeLocation: true,
  hideIp: false,
  selectedFiles: [],
  selectedThumbnails: [],
  code: null,
  expiresAt: null,
  words: null,
  manifest: null,
  manifestTotalSize: 0,
  progress: null,
  receivedFiles: [],
  errorTitle: '',
  errorMessage: '',
  errorAction: '',
  errorCanRetry: false,
};

// ── Settings Persistence ──

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

function saveSettings(state: Pick<AppState, 'removeLocation' | 'hideIp'>): void {
  try {
    localStorage.setItem('picbeam:removeLocation', String(state.removeLocation));
    localStorage.setItem('picbeam:hideIp', String(state.hideIp));
  } catch {
    // localStorage not available
  }
}

// ── Hook ──

export function useAppState() {
  const [state, setState] = useState<AppState>(() => ({
    ...defaultState,
    ...loadSettings(),
  }));

  const thumbnailUrls = useRef<string[]>([]);

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      thumbnailUrls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const update = useCallback((partial: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const setScreen = useCallback((screen: AppScreen) => {
    update({ screen });
  }, [update]);

  const setFiles = useCallback((files: File[]) => {
    thumbnailUrls.current.forEach((url) => URL.revokeObjectURL(url));
    const urls = files.slice(0, 12).map((f) => URL.createObjectURL(f));
    thumbnailUrls.current = urls;
    update({
      selectedFiles: files,
      selectedThumbnails: urls,
      screen: files.length > 0 ? 'picking' : 'home',
    });
  }, [update]);

  const removeFile = useCallback((index: number) => {
    setState((prev) => {
      const files = prev.selectedFiles.filter((_, i) => i !== index);
      if (prev.selectedThumbnails[index]) {
        URL.revokeObjectURL(prev.selectedThumbnails[index]);
      }
      const thumbs = prev.selectedThumbnails.filter((_, i) => i !== index);
      thumbnailUrls.current = thumbs;
      return {
        ...prev,
        selectedFiles: files,
        selectedThumbnails: thumbs,
        screen: files.length > 0 ? prev.screen : ('home' as AppScreen),
      };
    });
  }, []);

  const addFiles = useCallback((newFiles: File[]) => {
    setState((prev) => {
      const combined = [...prev.selectedFiles, ...newFiles];
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

  const setRemoveLocation = useCallback((v: boolean) => {
    update({ removeLocation: v });
    saveSettings({ removeLocation: v, hideIp: state.hideIp });
  }, [update, state.hideIp]);

  const setHideIp = useCallback((v: boolean) => {
    update({ hideIp: v });
    saveSettings({ removeLocation: state.removeLocation, hideIp: v });
  }, [update, state.removeLocation]);

  const setError = useCallback((title: string, message: string, action: string, canRetry = false) => {
    update({
      screen: 'error',
      errorTitle: title,
      errorMessage: message,
      errorAction: action,
      errorCanRetry: canRetry,
    });
  }, [update]);

  const reset = useCallback(() => {
    thumbnailUrls.current.forEach((url) => URL.revokeObjectURL(url));
    thumbnailUrls.current = [];
    setState((prev) => ({
      ...defaultState,
      removeLocation: prev.removeLocation,
      hideIp: prev.hideIp,
    }));
  }, []);

  return {
    state,
    update,
    setScreen,
    setFiles,
    removeFile,
    addFiles,
    setRemoveLocation,
    setHideIp,
    setError,
    reset,
  };
}

// ── Utility Functions ──

/** Format bytes to human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

/** Format seconds to human-readable time remaining */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `about ${Math.ceil(seconds)} s left`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return `about ${mins} min ${secs} s left`;
}

/** Format speed to human-readable string */
export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}
