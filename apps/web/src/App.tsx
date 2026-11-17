/**
 * PicBeam App — main application shell
 */
import { JSX } from 'preact';
import { useCallback, useEffect, useRef } from 'preact/hooks';
import { Header } from './components/Header';
import { Tabs } from './components/Tabs';
import { PrivateSheet } from './components/PrivateSheet';
import { SendPick } from './screens/SendPick';
import { SendWaiting } from './screens/SendWaiting';
import { SendTransferring } from './screens/SendTransferring';
import { SendDone } from './screens/SendDone';
import { ReceiveScanner } from './screens/ReceiveScanner';
import { ReceiveConsent } from './screens/ReceiveConsent';
import { Receiving } from './screens/Receiving';
import { ReceiveDone } from './screens/ReceiveDone';
import { ErrorScreen } from './screens/ErrorScreen';
import { useAppState } from './lib/state';
import { generateSessionId, generateSecret, buildQrUrl, parseQrUrl } from './lib/pairing/index';
import { cleanupAll } from './lib/opfs/index';
import { canShareFiles, shareFiles, createZip, downloadBlob } from './lib/zip/index';
import { WebRTCConnection, type IceConfig } from './lib/connection';
import {
  PROTOCOL_VERSION,
  type FileManifestEntry,
} from '@picbeam/protocol';
import { TransferSender, type SenderProgress } from './lib/transfer/sender';
import { TransferReceiver, type ReceiverProgress } from './lib/transfer/receiver';
import './App.css';

/** Build the WebSocket URL for signaling */
function wsUrl(): string {
  const customWs = import.meta.env['VITE_WS_URL'] as string | undefined;
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
  }, []);

  /** Full reset including connection teardown */
  const handleReset = useCallback(() => {
    cleanup();
    reset();
  }, [cleanup, reset]);

  // ── Sender: start connection after files are selected ──

  const startSenderConnection = useCallback(
    async (sessionId: string, secret: string, selectedFiles: File[]) => {
      const ice = await fetchIceConfig();
      const conn = new WebRTCConnection(wsUrl(), 'sender', sessionId, ice, secret);
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
        // Build manifest
        const manifest: FileManifestEntry[] = selectedFiles.map((f, i) => ({
          id: `file-${i}`,
          name: f.name,
          size: f.size,
          mimeType: f.type || 'application/octet-stream',
          lastModified: f.lastModified,
        }));

        // Create sender with the data channel
        const sender = new TransferSender(dc, selectedFiles, manifest);
        senderRef.current = sender;

        // Listen for progress updates
        sender.onProgress((progress: SenderProgress) => {
          if (progress.state === 'sending') {
            update({
              screen: 'send-transferring',
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

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      setFiles(files);

      const sessionId = generateSessionId();
      const secret = generateSecret();
      const domain = window.location.host;
      const qrUrl = buildQrUrl(domain, sessionId, secret);

      update({
        sessionId,
        secret,
        qrUrl,
        screen: 'send-waiting',
      });

      startSenderConnection(sessionId, secret, files);
    },
    [setFiles, update, startSenderConnection]
  );

  // ── Receiver: connect after code/QR ──

  const startReceiverConnection = useCallback(
    async (sessionId: string, secret?: string) => {
      const ice = await fetchIceConfig();
      const conn = new WebRTCConnection(wsUrl(), 'receiver', sessionId, ice, secret);
      connectionRef.current = conn;

      conn.on('stateChange', (connState: string) => {
        if (connState === 'failed') {
          setError('Connection failed', 'Could not connect to the sender.', 'Try again');
          cleanup();
        }
      });

      conn.on('dataChannel', (dc: RTCDataChannel) => {
        // Create receiver with event handlers
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
          onComplete: (files: Array<{ name: string; blob: Blob; mimeType: string }>) => {
            const received = files.map((f) => ({
              name: f.name,
              blob: f.blob,
              mimeType: f.mimeType,
              objectUrl: URL.createObjectURL(f.blob),
            }));
            update({ screen: 'receive-done', receivedFiles: received });
            cleanup();
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

      conn.on('sasWords', (words: [string, string, string, string]) => {
        update({ sasWords: words });
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

  const handleShowCode = useCallback(async () => {
    if (!state.sessionId) return;
    try {
      const res = await fetch('/api/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: state.sessionId }),
      });
      if (!res.ok) {
        console.warn('Failed to generate code');
        return;
      }
      const data = await res.json() as { code: string };
      update({ code: data.code });
    } catch {
      console.warn('Server not reachable for code generation');
    }
  }, [state.sessionId, update]);

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

  const handleQrScanned = useCallback(
    (url: string) => {
      const parsed = parseQrUrl(url);
      if (parsed) {
        update({
          sessionId: parsed.sessionId,
          secret: parsed.secret,
        });
        // Don't go to consent yet — wait for manifest from sender
        startReceiverConnection(parsed.sessionId, parsed.secret);
      } else {
        setError('Invalid QR code', 'The scanned code is not a valid PicBeam link.', 'Try again');
      }
    },
    [update, setError, startReceiverConnection]
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

        // Connect via WebSocket (no secret in code mode) — consent screen shown when manifest arrives
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
    update({ screen: 'receive-transferring' });
  }, [update]);

  const handleDecline = useCallback(() => {
    const receiver = receiverRef.current;
    if (receiver) {
      receiver.decline();
    }
    handleReset();
  }, [handleReset]);

  // Check if opened via /r#... deep link
  useEffect(() => {
    const hash = window.location.hash;
    if (window.location.pathname === '/r' && hash) {
      const parsed = parseQrUrl(window.location.href);
      if (parsed) {
        history.replaceState(null, '', '/');
        update({
          activeTab: 'receive',
          sessionId: parsed.sessionId,
          secret: parsed.secret,
        });
        startReceiverConnection(parsed.sessionId, parsed.secret);
      }
    }
  }, []);

  const handleSaveGallery = useCallback(async () => {
    const files = state.receivedFiles.map(
      (f) => new File([f.blob], f.name, { type: f.mimeType })
    );
    const shared = await shareFiles(files);
    if (!shared) {
      const zip = await createZip(state.receivedFiles.map((f) => ({ name: f.name, blob: f.blob })));
      downloadBlob(zip, 'PicBeam-photos.zip');
    }
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
            qrUrl={state.qrUrl ?? ''}
            connectionState={state.connectionState === 'connected' ? 'connected' : 'waiting'}
            code={state.code}
            onCancel={handleReset}
            onShowCode={handleShowCode}
            expired={false}
            onNewCode={() => handleFilesSelected(state.selectedFiles)}
            onRemoveFile={handleRemoveFile}
            onAddMore={handleAddMore}
          />
        );

      case 'send-transferring':
        return (
          <SendTransferring
            totalFiles={state.progress?.totalFiles ?? state.selectedFiles.length}
            bytesSent={state.progress?.bytesSent ?? 0}
            totalBytes={state.progress?.totalBytes ?? 0}
            speed={state.progress?.speed ?? 0}
            timeLeft={state.progress?.timeLeft ?? 0}
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
            onQrScanned={handleQrScanned}
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

      case 'receive-transferring':
        return (
          <Receiving
            currentFile={state.progress?.currentFile ?? 0}
            totalFiles={state.progress?.totalFiles ?? 0}
            bytesReceived={state.progress?.bytesSent ?? 0}
            totalBytes={state.progress?.totalBytes ?? 0}
            speed={state.progress?.speed ?? 0}
            files={state.progress?.fileStatuses ?? []}
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
