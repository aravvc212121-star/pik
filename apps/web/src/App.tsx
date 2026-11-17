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
import { useAppState, formatBytes } from './lib/state';
import { generateSessionId, generateSecret, buildQrUrl, parseQrUrl } from './lib/pairing/index';
import { cleanupAll } from './lib/opfs/index';
import { canShareFiles, shareFiles, createZip, downloadBlob } from './lib/zip/index';
import { WebRTCConnection, type IceConfig } from './lib/connection';
import {
  PROTOCOL_VERSION,
  type FileManifestEntry,
  type ManifestMessage,
  type DataChannelControlMessage,
} from '@picbeam/protocol';
import { TransferSender } from './lib/transfer/sender';
import { TransferReceiver } from './lib/transfer/receiver';
import './App.css';

/** Build the WebSocket URL for signaling */
function wsUrl(): string {
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

  // Hidden file input for "add more" flow
  const addMoreInputRef = useRef<HTMLInputElement>(null);

  // Refs for connection objects (don't trigger re-renders)
  const connectionRef = useRef<WebRTCConnection | null>(null);
  const senderRef = useRef<TransferSender | null>(null);
  const receiverRef = useRef<TransferReceiver | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  // Cleanup orphan OPFS files on mount
  useEffect(() => {
    cleanupAll();
  }, []);

  /** Tear down any active connection */
  const cleanup = useCallback(() => {
    connectionRef.current?.destroy();
    connectionRef.current = null;
    dataChannelRef.current = null;
    senderRef.current = null;
    receiverRef.current = null;
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
        if (connState === 'signaling' || connState === 'ice') {
          update({ connectionState: 'connected' });
        } else if (connState === 'connected') {
          update({ connectionState: 'connected' });
        } else if (connState === 'failed') {
          setError('Connection failed', 'Could not establish a connection with the other device.', 'Try again');
          cleanup();
        }
      });

      conn.on('dataChannel', (dc: RTCDataChannel) => {
        dataChannelRef.current = dc;

        // Build and send manifest
        const manifest: FileManifestEntry[] = selectedFiles.map((f, i) => ({
          id: `file-${i}`,
          name: f.name,
          size: f.size,
          mimeType: f.type || 'application/octet-stream',
          lastModified: f.lastModified,
        }));
        const totalSize = selectedFiles.reduce((s, f) => s + f.size, 0);

        const manifestMsg: ManifestMessage = {
          v: PROTOCOL_VERSION,
          type: 'manifest',
          files: manifest,
          totalSize,
          locationStripped: state.removeLocation,
        };
        dc.send(JSON.stringify(manifestMsg));

        // Listen for accept/decline/cancel from receiver
        dc.onmessage = (event) => {
          if (typeof event.data === 'string') {
            try {
              const msg = JSON.parse(event.data) as DataChannelControlMessage;
              if (msg.type === 'accept') {
                update({ screen: 'send-transferring', connectionState: 'transferring' });
                // Start sending files
                const sender = new TransferSender(dc, selectedFiles, state.removeLocation);
                senderRef.current = sender;
                sender.onProgress = (bytesSent, totalBytes, speed, timeLeft, currentFile, totalFiles) => {
                  update({
                    progress: { bytesSent, totalBytes, speed, timeLeft, currentFile, totalFiles, fileStatuses: [] },
                  });
                };
                sender.onComplete = () => {
                  update({ screen: 'send-done', connectionState: 'done' });
                  cleanup();
                };
                sender.onError = (err) => {
                  setError('Transfer failed', err.message, 'Try again');
                  cleanup();
                };
                sender.start();
              } else if (msg.type === 'decline') {
                setError('Declined', 'The receiver declined the transfer.', 'Try again');
                cleanup();
              } else if (msg.type === 'cancel') {
                setError('Cancelled', 'The receiver cancelled the transfer.', 'Try again');
                cleanup();
              }
            } catch { /* ignore parse errors */ }
          }
        };

        // Wait for receiver to accept (sender stays on send-waiting with "connected" status)
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

      // Generate session
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

      // Start the sender signaling connection
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
        dataChannelRef.current = dc;

        // Listen for manifest from sender
        dc.onmessage = (event) => {
          if (typeof event.data === 'string') {
            try {
              const msg = JSON.parse(event.data) as DataChannelControlMessage;
              if (msg.type === 'manifest') {
                const manifest = msg as ManifestMessage;
                update({
                  manifest: manifest.files,
                  manifestTotalSize: manifest.totalSize,
                  locationStripped: manifest.locationStripped,
                  screen: 'receive-consent',
                });
              }
            } catch { /* ignore parse errors */ }
          }
        };
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
    (index: number) => {
      removeFile(index);
    },
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
          screen: 'receive-consent',
        });
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

      // Resolve the code to get a sessionId
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
        update({
          sessionId: data.sessionId,
          screen: 'receive-consent', // Will be updated to actual consent when manifest arrives
        });

        // Connect via WebSocket (no secret in code mode)
        startReceiverConnection(data.sessionId);
      } catch {
        setError('Network error', 'Could not reach the server. Make sure both devices are online.', 'Try again');
      }
    },
    [update, setError, startReceiverConnection]
  );

  // ── Receiver: accept / decline ──

  const handleAccept = useCallback(() => {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== 'open') return;

    // Send accept message
    dc.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'accept' }));
    update({ screen: 'receive-transferring' });

    // Set up receiver to listen for file chunks
    const receiver = new TransferReceiver(dc, state.manifest ?? []);
    receiverRef.current = receiver;

    receiver.onProgress = (bytesReceived, totalBytes, speed, currentFile, totalFiles, fileStatuses) => {
      update({
        progress: {
          bytesSent: bytesReceived,
          totalBytes,
          speed,
          timeLeft: speed > 0 ? (totalBytes - bytesReceived) / speed : 0,
          currentFile,
          totalFiles,
          fileStatuses,
        },
      });
    };

    receiver.onComplete = (files) => {
      const received = files.map((f) => ({
        name: f.name,
        blob: f.blob,
        mimeType: f.mimeType,
        objectUrl: URL.createObjectURL(f.blob),
      }));
      update({ screen: 'receive-done', receivedFiles: received });
      cleanup();
    };

    receiver.onError = (err) => {
      setError('Transfer failed', err.message, 'Try again');
      cleanup();
    };

    receiver.start();
  }, [update, state.manifest, setError, cleanup]);

  const handleDecline = useCallback(() => {
    const dc = dataChannelRef.current;
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'decline' }));
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
          screen: 'receive-consent',
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
