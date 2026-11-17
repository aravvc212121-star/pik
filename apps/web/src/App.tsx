/**
 * PicBeam App — main application shell
 */
import { JSX } from 'preact';
import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import { Header } from './components/Header';
import { Tabs } from './components/Tabs';
import { PrivateSheet } from './components/PrivateSheet';
import { SendPick } from './screens/SendPick';
import { SendWaiting } from './screens/SendWaiting';
import { SendTransferring } from './screens/SendTransferring';
import { SendDone } from './screens/SendDone';
import { FlickReady } from './screens/FlickReady';
import { MidThrow } from './screens/MidThrow';
import { ReceiveScanner } from './screens/ReceiveScanner';
import { ReceiveConsent } from './screens/ReceiveConsent';
import { CatchWaiting } from './screens/CatchWaiting';
import { Catching } from './screens/Catching';
import { Receiving } from './screens/Receiving';
import { ReceiveDone } from './screens/ReceiveDone';
import { ErrorScreen } from './screens/ErrorScreen';
import { useAppState } from './lib/state';
import { generateSessionId } from './lib/pairing/index';
import { cleanupAll } from './lib/opfs/index';
import { canShareFiles, shareFiles, createZip, downloadBlob, downloadFiles } from './lib/zip/index';
import { WebRTCConnection, type IceConfig } from './lib/connection';
import {
  PROTOCOL_VERSION,
  type FileManifestEntry,
  isAllowedMimeType,
} from '@picbeam/protocol';
import { TransferSender, type SenderProgress } from './lib/transfer/sender';
import { TransferReceiver, type ReceiverProgress } from './lib/transfer/receiver';
import { generateThumbnail, revokeAllThumbnails } from './lib/thumbs';
import { DONE_PAUSE } from './lib/motion';
import './App.css';

/** Build the WebSocket URL for signaling */
function wsUrl(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  const customWs = env['VITE_WS_URL'] || env['NEXT_PUBLIC_WS_URL'];
  if (customWs) return customWs;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

/** Fetch ICE server config */
async function fetchIceConfig(): Promise<IceConfig> {
  try {
    const res = await fetch('/api/ice');
    if (res.ok) {
      return (await res.json()) as IceConfig;
    }
  } catch { /* fallback */ }
  return { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] };
}

export function App(): JSX.Element {
  const {
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
  } = useAppState();

  const [receivedThumbnails, setReceivedThumbnails] = useState<string[]>([]);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const connectionRef = useRef<WebRTCConnection | null>(null);
  const senderRef = useRef<TransferSender | null>(null);
  const receiverRef = useRef<TransferReceiver | null>(null);

  // Cleanup orphan OPFS files on mount
  useEffect(() => {
    cleanupAll();
  }, []);

  /** Tear down any active connection */
  const cleanup = useCallback(() => {
    senderRef.current?.destroy();
    senderRef.current = null;
    receiverRef.current?.destroy();
    receiverRef.current = null;
    connectionRef.current?.destroy();
    connectionRef.current = null;
    revokeAllThumbnails();
    setReceivedThumbnails([]);
  }, []);

  /** Full reset including connection teardown */
  const handleReset = useCallback(() => {
    cleanup();
    reset();
  }, [cleanup, reset]);

  // ── Mobile back button: navigate within app instead of closing ──

  const homeScreen = state.activeTab === 'send' ? 'send-pick' : 'receive-scanner';
  const isHome = state.screen === homeScreen;

  useEffect(() => {
    if (!isHome && !state.privateSheetOpen) {
      window.history.pushState({ screen: state.screen }, '');
    }
  }, [state.screen, isHome, state.privateSheetOpen]);

  useEffect(() => {
    if (state.privateSheetOpen) {
      window.history.pushState({ sheet: true }, '');
    }
  }, [state.privateSheetOpen]);

  useEffect(() => {
    const onPopState = () => {
      if (state.privateSheetOpen) {
        update({ privateSheetOpen: false });
        return;
      }
      if (isHome) return;
      handleReset();
      window.history.pushState(null, '');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [state.screen, state.privateSheetOpen, isHome, handleReset, update]);

  /** Sender: flick committed — start transfer */
  const handleFlickCommit = useCallback(() => {
    senderRef.current?.startTransfer();
  }, []);

  // ── Sender: start connection (always unencrypted — code mode only) ──

  const startSenderConnection = useCallback(
    async (sessionId: string, selectedFiles: File[]) => {
      const ice = await fetchIceConfig();
      const conn = new WebRTCConnection(wsUrl(), 'sender', sessionId, ice);
      connectionRef.current = conn;

      conn.on('stateChange', (connState: string) => {
        if (connState === 'signaling' || connState === 'ice' || connState === 'connected') {
          update({ connectionState: 'connected' });
        } else if (connState === 'failed') {
          setError('Connection failed', 'Could not establish a connection with the other device.', 'Try again');
          cleanup();
        }
      });

      conn.on('dataChannel', (dc: RTCDataChannel) => {
        // Build manifest with robust MIME type fallback
        const manifest: FileManifestEntry[] = selectedFiles.map((f, i) => {
          let mime = f.type;
          if (!mime || !isAllowedMimeType(mime)) {
            const ext = f.name.slice(f.name.lastIndexOf('.') + 1).toLowerCase();
            const extMap: Record<string, string> = {
              jpg: 'image/jpeg',
              jpeg: 'image/jpeg',
              png: 'image/png',
              gif: 'image/gif',
              webp: 'image/webp',
              heic: 'image/heic',
              heif: 'image/heif',
              avif: 'image/avif',
              dng: 'image/x-adobe-dng',
              mp4: 'video/mp4',
              mov: 'video/quicktime',
              webm: 'video/webm',
              mkv: 'video/x-matroska',
            };
            mime = extMap[ext] || 'image/jpeg';
          }
          return {
            id: `file-${i}`,
            name: f.name,
            size: f.size,
            mimeType: mime,
            lastModified: f.lastModified,
          };
        });

        // Create sender with the data channel (autoStart = false for flick gesture)
        const sender = new TransferSender(dc, selectedFiles, manifest, false);
        senderRef.current = sender;

        // Listen for progress updates
        sender.onProgress((progress: SenderProgress) => {
          if (progress.state === 'accepted') {
            update({
              screen: 'flick-ready',
              connectionState: 'connected',
            });
          } else if (progress.state === 'sending') {
            update({
              screen: 'mid-throw',
              connectionState: 'transferring',
              progress: {
                bytesSent: progress.bytesSent,
                totalBytes: progress.totalBytes,
                speed: progress.speed,
                timeLeft: progress.timeLeft,
                currentFile: progress.currentFileIndex,
                totalFiles: progress.totalFiles,
                fileStatuses: [],
              },
            });
          } else if (progress.state === 'done') {
            update({ screen: 'send-done', connectionState: 'done' });
            cleanup();
          } else if (progress.state === 'cancelled') {
            setError('Cancelled', 'The receiver declined or cancelled the transfer.', 'Try again');
            cleanup();
          } else if (progress.state === 'error') {
            setError('Transfer failed', 'An error occurred during the transfer.', 'Try again');
            cleanup();
          }
        });

        // Send the manifest — sender waits for accept/decline internally
        sender.sendManifest(state.removeLocation);
      });

      conn.on('error', (err: Error) => {
        console.error('Connection error:', err.message);
      });

      await conn.connect();
    },
    [update, setError, cleanup, state.removeLocation]
  );

  /** Generate a 6-digit code and start the sender connection */
  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      setFiles(files);

      const sessionId = generateSessionId();

      update({
        sessionId,
        screen: 'send-waiting',
        code: null,
      });

      // Generate the 6-digit code via API
      try {
        const res = await fetch('/api/code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        if (res.ok) {
          const data = await res.json() as { code: string };
          update({ code: data.code });
        }
      } catch {
        console.warn('Could not generate code');
      }

      // Start connection (no secret — code mode is always unencrypted signaling)
      startSenderConnection(sessionId, files);
    },
    [setFiles, update, startSenderConnection]
  );

  // ── Receiver: connect after code ──

  const startReceiverConnection = useCallback(
    async (sessionId: string) => {
      const ice = await fetchIceConfig();
      const conn = new WebRTCConnection(wsUrl(), 'receiver', sessionId, ice);
      connectionRef.current = conn;

      conn.on('stateChange', (connState: string) => {
        if (connState === 'failed') {
          setError('Connection failed', 'Could not connect to the sender.', 'Try again');
          cleanup();
        }
      });

      conn.on('dataChannel', (dc: RTCDataChannel) => {
        const receiver = new TransferReceiver(dc, {
          onManifest: (files: FileManifestEntry[], totalSize: number, locationStripped: boolean) => {
            update({
              manifest: files,
              manifestTotalSize: totalSize,
              locationStripped,
              screen: 'receive-consent',
            });
          },
          onProgress: (progress: ReceiverProgress) => {
            update({
              screen: progress.bytesReceived > 0 ? 'catching' : 'catch-waiting',
              progress: {
                bytesSent: progress.bytesReceived,
                totalBytes: progress.totalBytes,
                speed: progress.speed,
                timeLeft: progress.speed > 0 ? (progress.totalBytes - progress.bytesReceived) / progress.speed : 0,
                currentFile: progress.currentFileIndex,
                totalFiles: progress.totalFiles,
                fileStatuses: progress.files,
              },
            });
          },
          onFileReceived: async (file) => {
            try {
              const thumbUrl = await generateThumbnail(file.blob);
              setReceivedThumbnails((prev) => [...prev, thumbUrl]);
            } catch {
              setReceivedThumbnails((prev) => [...prev, URL.createObjectURL(file.blob)]);
            }
          },
          onComplete: (files: Array<{ name: string; blob: Blob; mimeType: string }>) => {
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              try {
                navigator.vibrate(30);
              } catch {
                /* ignore */
              }
            }
            const received = files.map((f) => ({
              name: f.name,
              blob: f.blob,
              mimeType: f.mimeType,
              objectUrl: URL.createObjectURL(f.blob),
            }));
            // 600ms pause so the last landing is visible
            setTimeout(() => {
              update({ screen: 'receive-done', receivedFiles: received });
              cleanup();
            }, DONE_PAUSE);
          },
          onError: (err: Error) => {
            setError('Transfer failed', err.message, 'Try again');
            cleanup();
          },
          onCancelled: () => {
            setError('Cancelled', 'The sender cancelled the transfer.', 'Try again');
            cleanup();
          },
        });
        receiverRef.current = receiver;
      });

      conn.on('error', (err: Error) => {
        console.error('Connection error:', err.message);
      });

      await conn.connect();
    },
    [update, setError, cleanup]
  );

  const handleRemoveFile = useCallback(
    (index: number) => { removeFile(index); },
    [removeFile]
  );

  const handleAddMore = useCallback(() => {
    addMoreInputRef.current?.click();
  }, []);

  const handleAddMoreFiles = useCallback(
    (e: Event) => {
      const input = e.target as HTMLInputElement;
      if (input.files && input.files.length > 0) {
        addFiles(Array.from(input.files));
      }
      input.value = '';
    },
    [addFiles]
  );

  const handleCodeSubmit = useCallback(
    async (code: string) => {
      update({ code });

      try {
        const res = await fetch('/api/code/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });

        if (!res.ok) {
          const err = await res.json() as { error?: string };
          const msg = err.error ?? 'Invalid code';
          if (msg === 'Too many attempts') {
            setError('Too many attempts', 'This code has been locked. Ask the sender for a new code.', 'Try again');
          } else if (msg === 'Code expired or invalid') {
            setError('Invalid code', 'This code is expired or incorrect. Check the code and try again.', 'Try again');
          } else {
            setError('Code error', msg, 'Try again');
          }
          return;
        }

        const data = await res.json() as { sessionId: string };
        update({ sessionId: data.sessionId });

        // Connect via WebSocket — consent screen shown when manifest arrives
        startReceiverConnection(data.sessionId);
      } catch {
        setError('Network error', 'Could not reach the server. Make sure both devices are online.', 'Try again');
      }
    },
    [update, setError, startReceiverConnection]
  );

  // ── Receiver: accept / decline ──

  const handleAccept = useCallback(() => {
    const receiver = receiverRef.current;
    if (!receiver) return;
    receiver.accept();
    update({ screen: 'catch-waiting' });
  }, [update]);

  const handleDecline = useCallback(() => {
    const receiver = receiverRef.current;
    if (receiver) {
      receiver.decline();
    }
    handleReset();
  }, [handleReset]);

  const handleSaveGallery = useCallback(async () => {
    if (state.receivedFiles.length === 0) return;

    // Preserve original image quality completely - no compression, resizing, or conversion
    const files = state.receivedFiles.map(
      (f) => new File([f.blob], f.name, { type: f.mimeType })
    );

    // Use browser's Web Share API (navigator.share and navigator.canShare)
    const result = await shareFiles(files);

    // If native file sharing is unsupported or fails for reasons other than user cancellation,
    // fall back to the existing normal download functionality
    if (result === 'fallback') {
      if (state.receivedFiles.length === 1) {
        const single = state.receivedFiles[0]!;
        downloadBlob(single.blob, single.name);
      } else {
        downloadFiles(state.receivedFiles.map((f) => ({ name: f.name, blob: f.blob })));
      }
    }
    // If result === 'cancelled', do not automatically trigger a download
  }, [state.receivedFiles]);

  const handleDownloadZip = useCallback(async () => {
    const zip = await createZip(state.receivedFiles.map((f) => ({ name: f.name, blob: f.blob })));
    downloadBlob(zip, 'PicBeam-photos.zip');
  }, [state.receivedFiles]);

  const renderScreen = (): JSX.Element => {
    switch (state.screen) {
      case 'send-pick':
        return <SendPick onFilesSelected={handleFilesSelected} />;

      case 'send-waiting':
        return (
          <SendWaiting
            files={state.selectedFiles}
            thumbnails={state.selectedThumbnails}
            connectionState={state.connectionState === 'connected' ? 'connected' : 'waiting'}
            code={state.code}
            onCancel={handleReset}
            onNewCode={() => handleFilesSelected(state.selectedFiles)}
            onRemoveFile={handleRemoveFile}
            onAddMore={handleAddMore}
          />
        );

      case 'flick-ready':
        return (
          <FlickReady
            files={state.selectedFiles}
            thumbnails={state.selectedThumbnails}
            onCommit={handleFlickCommit}
            onCancel={handleReset}
          />
        );

      case 'mid-throw':
      case 'send-transferring':
        return (
          <MidThrow
            totalFiles={state.progress?.totalFiles ?? state.selectedFiles.length}
            sentCount={state.progress?.currentFile ?? 0}
            bytesSent={state.progress?.bytesSent ?? 0}
            totalBytes={state.progress?.totalBytes ?? 0}
            timeLeft={state.progress?.timeLeft ?? 0}
            thumbnails={state.selectedThumbnails}
            onCancel={handleReset}
          />
        );

      case 'send-done':
        return (
          <SendDone
            totalFiles={state.selectedFiles.length}
            totalBytes={state.selectedFiles.reduce((s, f) => s + f.size, 0)}
            onSendMore={handleReset}
            onDone={handleReset}
          />
        );

      case 'receive-scanner':
        return (
          <ReceiveScanner
            onCodeSubmit={handleCodeSubmit}
          />
        );

      case 'receive-consent':
        return (
          <ReceiveConsent
            files={state.manifest ?? []}
            totalSize={state.manifestTotalSize}
            onAccept={handleAccept}
            onDecline={handleDecline}
          />
        );

      case 'catch-waiting':
        return (
          <CatchWaiting
            totalFiles={state.manifest?.length ?? 0}
            onCancel={handleReset}
          />
        );

      case 'catching':
      case 'receive-transferring':
        return (
          <Catching
            completedCount={receivedThumbnails.length}
            totalFiles={state.progress?.totalFiles ?? state.manifest?.length ?? 0}
            bytesReceived={state.progress?.bytesSent ?? 0}
            totalBytes={state.progress?.totalBytes ?? state.manifestTotalSize}
            speed={state.progress?.speed ?? 0}
            receivedThumbnails={receivedThumbnails}
            onCancel={handleReset}
          />
        );

      case 'receive-done':
        return (
          <ReceiveDone
            files={state.receivedFiles}
            totalBytes={state.receivedFiles.reduce((s, f) => s + f.blob.size, 0)}
            onSaveGallery={handleSaveGallery}
            onDownloadZip={handleDownloadZip}
            canShare={canShareFiles()}
          />
        );

      case 'error':
        return (
          <ErrorScreen
            title={state.errorTitle}
            message={state.errorMessage}
            actionLabel={state.errorAction || 'Try again'}
            onAction={handleReset}
          />
        );

      default:
        return <SendPick onFilesSelected={handleFilesSelected} />;
    }
  };

  return (
    <div class="app">
      <div class="app__phone">
        <Header onPrivateClick={() => update({ privateSheetOpen: true })} />
        <Tabs active={state.activeTab} onChange={setTab} />

        <div
          class="app__content"
          role="tabpanel"
          id={`panel-${state.activeTab}`}
          aria-labelledby={`tab-${state.activeTab}`}
        >
          {renderScreen()}
        </div>
      </div>

      {/* Hidden file input for "add more" on send-waiting screen */}
      <input
        ref={addMoreInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: '0', padding: '0', margin: '-1px' }}
        onChange={handleAddMoreFiles}
        aria-hidden="true"
        tabIndex={-1}
      />

      <PrivateSheet
        open={state.privateSheetOpen}
        onClose={() => update({ privateSheetOpen: false })}
        removeLocation={state.removeLocation}
        onRemoveLocationChange={setRemoveLocation}
        hideIp={state.hideIp}
        onHideIpChange={setHideIp}
      />
    </div>
  );
}
