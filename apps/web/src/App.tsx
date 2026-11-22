/**
 * PicBeam App — UI-only redesign driven by Session interface.
 * No tabs, no QR, no word verification. Split Home → code-only flow.
 * Runs against MockSession for testing without a backend.
 */
import { JSX } from 'preact';
import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import { MockSession } from './session/mock';
import type { Session, SessionState, FileInfo, ReceivedFileData, TransferProgress, SessionError } from './session/types';
import { Home } from './screens/Home';
import { PickPhotos } from './screens/PickPhotos';
import { ShareCode } from './screens/ShareCode';
import { FlickToThrow } from './screens/FlickToThrow';
import { Sending } from './screens/Sending';
import { Sent } from './screens/Sent';
import { EnterCode } from './screens/EnterCode';
import { Accept } from './screens/Accept';
import { WaitingForThrow } from './screens/WaitingForThrow';
import { Catching } from './screens/Catching';
import { Received } from './screens/Received';
import { ErrorScreen } from './screens/ErrorScreen';
import { PrivacySheet } from './components/PrivacySheet';
import { generateThumbnail, revokeAllThumbnails } from './lib/thumbs';
import { DONE_PAUSE } from './lib/motion';
import './App.css';

// ── App screen type ──

type AppScreen =
  | 'home'
  | 'picking'
  | 'code-ready'
  | 'code-connected'
  | 'flick-ready'
  | 'sending'
  | 'sent'
  | 'enter-code'
  | 'accept'
  | 'waiting-for-throw'
  | 'catching'
  | 'received'
  | 'error';

// ── Settings persistence ──

function loadSetting(key: string, defaultVal: boolean): boolean {
  try {
    const val = localStorage.getItem(`picbeam:${key}`);
    if (val === null) return defaultVal;
    return val === 'true';
  } catch {
    return defaultVal;
  }
}

function saveSetting(key: string, val: boolean): void {
  try {
    localStorage.setItem(`picbeam:${key}`, String(val));
  } catch { /* noop */ }
}

// ── Helpers ──

function canShareFiles(files?: File[]): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare === 'function') {
    try {
      if (files && files.length > 0) {
        return navigator.canShare({ files });
      }
      const testFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      return navigator.canShare({ files: [testFile] });
    } catch {
      return false;
    }
  }
  return true;
}

async function downloadBlob(blob: Blob, name: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

export function App(): JSX.Element {
  // ── State ──
  const [screen, setScreen] = useState<AppScreen>('home');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [removeLocation, setRemoveLocation] = useState(() => loadSetting('removeLocation', true));
  const [hideIp, setHideIp] = useState(() => loadSetting('hideIp', false));

  // Send state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [connected, setConnected] = useState(false);

  // Receive state
  const [manifest, setManifest] = useState<FileInfo[]>([]);
  const [manifestTotalSize, setManifestTotalSize] = useState(0);

  // Transfer state
  const [progress, setProgress] = useState<TransferProgress | null>(null);

  // Received files
  const [receivedFiles, setReceivedFiles] = useState<Array<ReceivedFileData & { objectUrl: string }>>([]);
  const [receivedThumbnails, setReceivedThumbnails] = useState<string[]>([]);

  // Error state
  const [errorTitle, setErrorTitle] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorAction, setErrorAction] = useState('Try again');
  const [errorTheme, setErrorTheme] = useState<'light' | 'dark'>('light');

  // Code entry state
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);

  // Role tracking
  const [role, setRole] = useState<'sender' | 'receiver' | null>(null);
  const roleRef = useRef<'sender' | 'receiver' | null>(null);

  // Session ref
  const sessionRef = useRef<Session | null>(null);

  // Screen & privacy refs for popstate listener
  const screenRef = useRef<AppScreen>(screen);
  screenRef.current = screen;
  const privacyOpenRef = useRef(privacyOpen);
  privacyOpenRef.current = privacyOpen;

  // ── Cleanup ──

  const cleanup = useCallback(() => {
    sessionRef.current?.destroy();
    sessionRef.current = null;
    revokeAllThumbnails();
  }, []);

  const reset = useCallback(() => {
    cleanup();
    roleRef.current = null;
    setScreen('home');
    setSelectedFiles([]);
    setThumbnails([]);
    setCode(null);
    setExpiresAt(0);
    setConnected(false);
    setManifest([]);
    setManifestTotalSize(0);
    setProgress(null);
    setReceivedFiles([]);
    setReceivedThumbnails([]);
    setCodeError(null);
    setCodeLoading(false);
    setRole(null);
  }, [cleanup]);

  // ── Mobile native back navigation (popstate) ──

  useEffect(() => {
    if (typeof window === 'undefined' || !window.history) return;

    if (screen === 'home') {
      if (window.history.state?.screen && window.history.state.screen !== 'home') {
        window.history.replaceState({ screen: 'home' }, '');
      }
    } else {
      if (window.history.state?.screen !== screen) {
        window.history.pushState({ screen }, '');
      }
    }
  }, [screen]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.history) return;
    if (privacyOpen) {
      window.history.pushState({ privacy: true }, '');
    }
  }, [privacyOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.history.replaceState({ screen: 'home' }, '');

    const handlePopState = () => {
      // 1. If privacy sheet is open, close it
      if (privacyOpenRef.current) {
        setPrivacyOpen(false);
        return;
      }

      const curScreen = screenRef.current;
      if (curScreen === 'home') return;

      // 2. Step backward towards home
      if (
        curScreen === 'code-ready' ||
        curScreen === 'code-connected' ||
        curScreen === 'flick-ready' ||
        curScreen === 'sending'
      ) {
        sessionRef.current?.cancel();
        reset();
      } else if (
        curScreen === 'accept' ||
        curScreen === 'waiting-for-throw' ||
        curScreen === 'catching'
      ) {
        sessionRef.current?.declineFiles();
        reset();
      } else {
        reset();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [reset]);

  // ── Settings ──

  const handleRemoveLocationChange = useCallback((v: boolean) => {
    setRemoveLocation(v);
    saveSetting('removeLocation', v);
  }, []);

  const handleHideIpChange = useCallback((v: boolean) => {
    setHideIp(v);
    saveSetting('hideIp', v);
  }, []);

  // ── Create and wire up a session ──

  const createSession = useCallback((): Session => {
    const session = new MockSession();
    sessionRef.current = session;

    session.on('codeReady', (c: string, exp: number) => {
      setCode(c);
      setExpiresAt(exp);
      setScreen('code-ready');
    });

    session.on('peerJoined', () => {
      setConnected(true);
      // When receiver connects, show "Receiver connected / Waiting for them to accept"
      if (roleRef.current === 'sender') {
        setScreen('code-connected');
      }
    });

    session.on('manifestReady', (files: FileInfo[], totalSize: number) => {
      setManifest(files);
      setManifestTotalSize(totalSize);
      setScreen('accept');
    });

    session.on('readyToThrow', () => {
      if (roleRef.current === 'sender') {
        setScreen('flick-ready');
      }
    });

    session.on('accepted', () => {
      // Sender: receiver accepted
      if (roleRef.current === 'sender') {
        setScreen('flick-ready');
      }
    });

    session.on('progress', (p: TransferProgress) => {
      setProgress(p);
    });

    session.on('fileDone', async (_index: number, file: ReceivedFileData) => {
      try {
        const thumbUrl = await generateThumbnail(file.blob);
        setReceivedThumbnails(prev => [...prev, thumbUrl]);
      } catch {
        const url = URL.createObjectURL(file.blob);
        setReceivedThumbnails(prev => [...prev, url]);
      }
      setReceivedFiles(prev => [...prev, {
        ...file,
        objectUrl: URL.createObjectURL(file.blob),
      }]);
    });

    session.on('done', () => {
      setTimeout(() => {
        if (roleRef.current === 'sender' || (sessionRef.current && sessionRef.current.state === 'done' && selectedFiles.length > 0)) {
          setScreen('sent');
        } else {
          setScreen('received');
        }
      }, DONE_PAUSE);
    });

    session.on('error', (err: SessionError) => {
      if (err.type === 'wrong-code') {
        setCodeError("That code didn't work. Check it and try again.");
        setCodeLoading(false);
        return;
      }
      if (err.type === 'too-many-attempts') {
        setCodeError('Too many tries. Ask for a new code.');
        setCodeLoading(false);
        return;
      }

      const errorMessages: Record<string, [string, string]> = {
        'code-expired': ['This code has expired', 'The code has timed out. Ask the sender for a new one.'],
        'declined': ['Sharing declined', 'They declined the photos.'],
        'connection-lost': ['Connection lost', "Couldn't reconnect. Please try again."],
        'cancelled': ['Sharing cancelled', 'The transfer was cancelled.'],
        'storage-full': ['Storage full', 'There isn\'t enough space to receive these photos.'],
        'browser-unsupported': ['Browser not supported', 'Please use a modern browser like Chrome, Safari or Firefox.'],
        'offline': ['You\'re offline', 'You need internet to send or receive.'],
      };

      const [title, message] = errorMessages[err.type] ?? ['Something went wrong', err.message];
      setErrorTitle(title);
      setErrorMessage(message);
      setErrorAction(err.type === 'code-expired' ? 'Get a new code' : 'Back to Home');
      setErrorTheme(roleRef.current === 'receiver' ? 'dark' : 'light');
      setScreen('error');
    });

    session.on('stateChange', (state: SessionState) => {
      if (state === 'transferring') {
        if (roleRef.current === 'sender') {
          setScreen('sending');
        } else {
          setScreen('catching');
        }
      } else if (state === 'ready-to-throw') {
        if (roleRef.current === 'receiver') {
          setScreen('waiting-for-throw');
        } else if (roleRef.current === 'sender') {
          setScreen('flick-ready');
        }
      }
    });

    return session;
  }, [cleanup, selectedFiles.length]);

  // ── Sender flow ──

  const handleSendClick = useCallback((files: File[]) => {
    if (files.length === 0) return;
    roleRef.current = 'sender';
    setRole('sender');
    setSelectedFiles(files);

    // Generate thumbnails
    const urls = files.slice(0, 12).map(f => URL.createObjectURL(f));
    setThumbnails(urls);
    setScreen('picking');
  }, []);

  const handleGetCode = useCallback(() => {
    const session = createSession();
    session.startSending(selectedFiles);
  }, [createSession, selectedFiles]);

  const handleShareCode = useCallback(async () => {
    if (!code) return;
    const normalizedCode = code.replace(/\s/g, '');
    try {
      await navigator.share({
        title: 'PicBeam code',
        text: `Here's my PicBeam code: ${normalizedCode}`,
      });
    } catch { /* user cancelled */ }
  }, [code]);

  const handleCopyCode = useCallback(() => {
    if (!code) return;
    const normalizedCode = code.replace(/\s/g, '');
    navigator.clipboard?.writeText(normalizedCode).catch(() => {
      // Fallback: select text
    });
  }, [code]);

  const handleFlickCommit = useCallback(() => {
    sessionRef.current?.startTransfer();
  }, []);

  // ── Receiver flow ──

  const handleReceiveClick = useCallback(() => {
    roleRef.current = 'receiver';
    setRole('receiver');
    setCodeError(null);
    setCodeLoading(false);
    sessionRef.current?.destroy();
    const session = createSession();
    session.openTransports?.();
    setScreen('enter-code');
  }, [createSession]);

  const handleCodeSubmit = useCallback((inputCode: string) => {
    setCodeError(null);
    setCodeLoading(true);
    let session = sessionRef.current;
    if (!session) {
      session = createSession();
    }
    session.enterCode(inputCode);
  }, [createSession]);

  const handleAccept = useCallback(() => {
    // Skip word verification — go straight to accepting
    const session = sessionRef.current;
    if (session) {
      session.confirmWordsReceiver();
      session.acceptFiles();
    }
    setScreen('waiting-for-throw');
  }, []);

  const handleCancelSender = useCallback(() => {
    sessionRef.current?.cancel();
    setTimeout(() => {
      reset();
    }, 100);
  }, [reset]);

  const handleDecline = useCallback(() => {
    sessionRef.current?.declineFiles();
    setTimeout(() => {
      reset();
    }, 100);
  }, [reset]);

  // ── Received file actions ──

  const handleSaveGallery = useCallback(async () => {
    if (receivedFiles.length === 0) return;
    const files = receivedFiles.map((f, i) => {
      const mime = f.mimeType && f.mimeType.startsWith('image/') ? f.mimeType : 'image/jpeg';
      const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
      const name = f.name.includes('.') ? f.name : `photo_${i + 1}${ext}`;
      return new File([f.blob], name, { type: mime, lastModified: Date.now() });
    });

    if (canShareFiles(files)) {
      try {
        await navigator.share({
          files,
          title: 'Save to Gallery',
        });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }
  }, [receivedFiles]);

  const handleDownloadZip = useCallback(async () => {
    // Dynamic import client-zip for tree-shaking
    const { downloadZip } = await import('client-zip');
    const entries = receivedFiles.map(f => ({ name: f.name, input: f.blob }));
    const blob = await downloadZip(entries).blob();
    await downloadBlob(blob, 'PicBeam-photos.zip');
  }, [receivedFiles]);

  // ── File management ──

  const handleRemoveFile = useCallback((index: number) => {
    setSelectedFiles(prev => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        setScreen('home');
      }
      return next;
    });
    setThumbnails(prev => {
      if (prev[index]) URL.revokeObjectURL(prev[index]!);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleAddMore = useCallback((newFiles: File[]) => {
    setSelectedFiles(prev => [...prev, ...newFiles]);
    const newUrls = newFiles.slice(0, 12 - thumbnails.length).map(f => URL.createObjectURL(f));
    setThumbnails(prev => [...prev, ...newUrls]);
  }, [thumbnails.length]);

  const handleClear = useCallback(() => {
    thumbnails.forEach(url => URL.revokeObjectURL(url));
    setSelectedFiles([]);
    setThumbnails([]);
    setScreen('home');
  }, [thumbnails]);

  // ── Back button handling ──

  useEffect(() => {
    if (screen !== 'home' && !privacyOpen) {
      window.history.pushState({ screen }, '');
    }
  }, [screen, privacyOpen]);

  useEffect(() => {
    if (privacyOpen) {
      window.history.pushState({ sheet: true }, '');
    }
  }, [privacyOpen]);

  useEffect(() => {
    const onPopState = () => {
      if (privacyOpen) {
        setPrivacyOpen(false);
        return;
      }
      if (screen === 'home') return;
      reset();
      window.history.pushState(null, '');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [screen, privacyOpen, reset]);

  // ── Aria live region ──

  const [liveMessage, setLiveMessage] = useState('');

  useEffect(() => {
    const messages: Partial<Record<AppScreen, string>> = {
      'code-connected': 'Receiver connected',
      'sending': progress ? `Sending ${progress.currentFile + 1} of ${manifest.length || selectedFiles.length}` : 'Sending',
      'catching': progress ? `Catching ${receivedThumbnails.length} of ${manifest.length}` : 'Catching',
      'sent': 'All photos sent',
      'received': `Received ${receivedFiles.length} photos`,
    };
    const msg = messages[screen];
    if (msg) setLiveMessage(msg);
  }, [screen, progress, manifest.length, selectedFiles.length, receivedThumbnails.length, receivedFiles.length]);

  // ── Render ──

  const totalSize = selectedFiles.reduce((s, f) => s + f.size, 0);

  const renderScreen = (): JSX.Element => {
    switch (screen) {
      case 'home':
        return (
          <Home
            onSend={handleSendClick}
            onReceive={handleReceiveClick}
            onPrivacyClick={() => setPrivacyOpen(true)}
          />
        );

      case 'picking':
        return (
          <PickPhotos
            files={selectedFiles}
            thumbnails={thumbnails}
            onGetCode={handleGetCode}
            onRemoveFile={handleRemoveFile}
            onAddMore={handleAddMore}
            onClear={handleClear}
            onBack={() => reset()}
          />
        );

      case 'code-ready':
      case 'code-connected':
        return (
          <ShareCode
            code={code ?? ''}
            expiresAt={expiresAt}
            connected={screen === 'code-connected'}
            onBack={handleCancelSender}
            onShare={handleShareCode}
            onCopy={handleCopyCode}
            onCancel={handleCancelSender}
          />
        );

      case 'flick-ready':
        return (
          <FlickToThrow
            files={selectedFiles}
            thumbnails={thumbnails}
            totalSize={totalSize}
            onCommit={handleFlickCommit}
            onCancel={handleCancelSender}
            enabled={true}
          />
        );

      case 'sending':
        return (
          <Sending
            currentFile={(progress?.currentFile ?? 0) + 1}
            totalFiles={selectedFiles.length}
            bytesSent={progress?.bytes ?? 0}
            totalBytes={progress?.total ?? totalSize}
            timeLeft={progress?.eta}
            onCancel={handleCancelSender}
          />
        );

      case 'sent':
        return (
          <Sent
            totalFiles={selectedFiles.length}
            onSendMore={() => reset()}
            onDone={() => reset()}
          />
        );

      case 'enter-code':
        return (
          <EnterCode
            onSubmit={handleCodeSubmit}
            onBack={() => reset()}
            error={codeError}
            loading={codeLoading}
          />
        );

      case 'accept':
        return (
          <Accept
            files={manifest}
            totalSize={manifestTotalSize}
            onAccept={handleAccept}
            onDecline={handleDecline}
            onClose={handleDecline}
          />
        );

      case 'waiting-for-throw':
        return (
          <WaitingForThrow
            totalFiles={manifest.length}
            totalSize={manifestTotalSize}
            onCancel={handleDecline}
          />
        );

      case 'catching':
        return (
          <Catching
            completedCount={receivedThumbnails.length}
            totalFiles={manifest.length}
            bytesReceived={progress?.bytes ?? 0}
            totalBytes={progress?.total ?? manifestTotalSize}
            speed={progress?.speed ?? 0}
            receivedThumbnails={receivedThumbnails}
            onCancel={handleDecline}
          />
        );

      case 'received':
        return (
          <Received
            files={receivedFiles}
            totalBytes={receivedFiles.reduce((s, f) => s + f.blob.size, 0)}
            onSaveGallery={handleSaveGallery}
            onDownloadZip={handleDownloadZip}
            canShare={canShareFiles()}
          />
        );

      case 'error':
        return (
          <ErrorScreen
            title={errorTitle}
            message={errorMessage}
            actionLabel={errorAction}
            onAction={() => reset()}
            theme={errorTheme}
          />
        );

      default:
        return (
          <Home
            onSend={handleSendClick}
            onReceive={handleReceiveClick}
            onPrivacyClick={() => setPrivacyOpen(true)}
          />
        );
    }
  };

  return (
    <>
      {renderScreen()}

      {/* Aria live region for screen reader announcements */}
      <div class="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>

      <PrivacySheet
        open={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        removeLocation={removeLocation}
        onRemoveLocationChange={handleRemoveLocationChange}
        hideIp={hideIp}
        onHideIpChange={handleHideIpChange}
      />
    </>
  );
}
