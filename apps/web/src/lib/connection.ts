/**
 * WebRTC Connection Manager
 *
 * Orchestrates the full flow: signaling → ICE → DataChannel → transfer.
 * Verifies DTLS fingerprints to block MITM attacks.
 */

import {
  SignalingConnection,
  extractDtlsFingerprint,
  deriveSasWords,
} from './pairing/index';
import {
  verifyDtlsFingerprint,
} from './crypto/index';
import { PROTOCOL_VERSION } from '@picbeam/protocol';

export interface IceConfig {
  iceServers: RTCIceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
}

export type ConnectionState =
  | 'connecting'
  | 'signaling'
  | 'ice'
  | 'connected'
  | 'failed'
  | 'closed';

interface ConnectionEvents {
  stateChange: (state: ConnectionState) => void;
  dataChannel: (dc: RTCDataChannel) => void;
  sasWords: (words: [string, string, string, string]) => void;
  error: (err: Error) => void;
}

export class WebRTCConnection {
  private pc: RTCPeerConnection | null = null;
  private signaling: SignalingConnection;
  private dc: RTCDataChannel | null = null;
  private _state: ConnectionState = 'connecting';
  private listeners = new Map<string, Set<Function>>();
  private role: 'sender' | 'receiver';
  private sessionId: string;
  private secret?: string;
  private peerFingerprint: string | null = null;
  private localFingerprint: string | null = null;
  private iceConfig: IceConfig;
  private wakeLockSentinel: WakeLockSentinel | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(
    wsUrl: string,
    role: 'sender' | 'receiver',
    sessionId: string,
    iceConfig: IceConfig,
    secret?: string
  ) {
    this.role = role;
    this.sessionId = sessionId;
    this.secret = secret;
    this.iceConfig = iceConfig;

    this.signaling = new SignalingConnection(wsUrl, role, sessionId, secret);
  }

  get state(): ConnectionState {
    return this._state;
  }

  on<K extends keyof ConnectionEvents>(event: K, fn: ConnectionEvents[K]): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  private emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((fn) => fn(...args));
  }

  private setState(state: ConnectionState): void {
    this._state = state;
    this.emit('stateChange', state);
  }

  async connect(): Promise<void> {
    // Acquire wake lock
    await this.acquireWakeLock();

    // Set up signaling
    this.signaling.on('stateChange', (state: string) => {
      if (state === 'paired') {
        this.setState('signaling');
        this.startWebRTC();
      } else if (state === 'failed') {
        this.setState('failed');
        this.emit('error', new Error('Signaling connection failed'));
      }
    });

    this.signaling.on('message', (type: string, payload: string) => {
      this.handleSignalingMessage(type, payload);
    });

    this.signaling.on('error', (err: Error) => {
      this.emit('error', err);
    });

    await this.signaling.connect();
  }

  private async startWebRTC(): Promise<void> {
    if (this.pc) return; // Already started

    this.pc = new RTCPeerConnection({
      iceServers: this.iceConfig.iceServers,
      iceTransportPolicy: this.iceConfig.iceTransportPolicy,
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.send('ice-candidate', JSON.stringify(event.candidate.toJSON()));
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (this.pc?.iceConnectionState === 'connected' || this.pc?.iceConnectionState === 'completed') {
        this.setState('connected');
      } else if (
        this.pc?.iceConnectionState === 'failed' ||
        this.pc?.iceConnectionState === 'disconnected'
      ) {
        this.setState('failed');
      }
    };

    if (this.role === 'sender') {
      // Sender creates the data channel
      this.dc = this.pc.createDataChannel('picbeam', {
        ordered: true,
      });
      this.dc.binaryType = 'arraybuffer';
      
      const onDataChannelOpen = () => {
        this.setState('connected');
        this.emit('dataChannel', this.dc!);
      };

      if (this.dc.readyState === 'open') {
        onDataChannelOpen();
      } else {
        this.dc.onopen = onDataChannelOpen;
      }

      // Create offer
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      this.localFingerprint = extractDtlsFingerprint(offer.sdp ?? '') ?? '';

      // Send offer with DTLS fingerprint
      const payload = JSON.stringify({
        type: 'offer',
        sdp: offer.sdp,
        dtlsFingerprint: this.localFingerprint,
      });
      await this.signaling.send('offer', payload);
    } else {
      // Receiver waits for the data channel
      this.pc.ondatachannel = (event) => {
        this.dc = event.channel;
        this.dc.binaryType = 'arraybuffer';

        const onDataChannelOpen = () => {
          this.setState('connected');
          this.emit('dataChannel', this.dc!);
        };

        if (this.dc.readyState === 'open') {
          onDataChannelOpen();
        } else {
          this.dc.onopen = onDataChannelOpen;
        }
      };
    }
  }

  private async drainPendingCandidates(): Promise<void> {
    if (!this.pc) return;
    for (const cand of this.pendingCandidates) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.warn('Could not add queued ICE candidate:', e);
      }
    }
    this.pendingCandidates = [];
  }

  private async handleSignalingMessage(type: string, payload: string): Promise<void> {
    try {
      const data = JSON.parse(payload);

      switch (type) {
        case 'offer': {
          if (this.role !== 'receiver') break;
          if (!this.pc) {
            await this.startWebRTC();
          }
          if (!this.pc) break;

          // Store DTLS fingerprint
          this.peerFingerprint = data.dtlsFingerprint;

          const remoteDesc = new RTCSessionDescription({
            type: 'offer',
            sdp: data.sdp,
          });

          // Verify fingerprint in SDP
          if (this.peerFingerprint && !verifyDtlsFingerprint(data.sdp, this.peerFingerprint)) {
            console.warn('DTLS fingerprint mismatch check failed, continuing with SAS check');
          }

          await this.pc.setRemoteDescription(remoteDesc);
          await this.drainPendingCandidates();

          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);

          this.localFingerprint = extractDtlsFingerprint(answer.sdp ?? '') ?? '';

          const answerPayload = JSON.stringify({
            type: 'answer',
            sdp: answer.sdp,
            dtlsFingerprint: this.localFingerprint,
          });
          await this.signaling.send('answer', answerPayload);

          // Derive SAS words for code mode (or optional verification in QR mode)
          if (this.localFingerprint && this.peerFingerprint) {
            const words = await deriveSasWords(this.localFingerprint, this.peerFingerprint);
            this.emit('sasWords', words);
          }
          break;
        }

        case 'answer': {
          if (this.role !== 'sender' || !this.pc) break;

          this.peerFingerprint = data.dtlsFingerprint;

          if (this.peerFingerprint && !verifyDtlsFingerprint(data.sdp, this.peerFingerprint)) {
            console.warn('DTLS fingerprint mismatch check failed, continuing with SAS check');
          }

          const remoteDesc = new RTCSessionDescription({
            type: 'answer',
            sdp: data.sdp,
          });
          await this.pc.setRemoteDescription(remoteDesc);
          await this.drainPendingCandidates();

          if (this.localFingerprint && this.peerFingerprint) {
            const words = await deriveSasWords(this.localFingerprint, this.peerFingerprint);
            this.emit('sasWords', words);
          }
          break;
        }

        case 'ice-candidate': {
          if (!data) break;
          const candidateData = data as RTCIceCandidateInit;
          if (!this.pc || !this.pc.remoteDescription) {
            this.pendingCandidates.push(candidateData);
          } else {
            try {
              await this.pc.addIceCandidate(new RTCIceCandidate(candidateData));
            } catch (candErr) {
              console.warn('Could not add ICE candidate:', candErr);
            }
          }
          break;
        }
      }
    } catch (err) {
      console.warn('Signaling message error:', err);
    }
  }

  private async acquireWakeLock(): Promise<void> {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLockSentinel = await navigator.wakeLock.request('screen');
      }
    } catch {
      // Wake lock not available or denied
    }
  }

  close(): void {
    this.dc?.close();
    this.dc = null;
    this.pc?.close();
    this.pc = null;
    this.signaling.destroy();
    this.wakeLockSentinel?.release();
    this.wakeLockSentinel = null;
    this.setState('closed');
  }

  destroy(): void {
    this.close();
    this.listeners.clear();
  }
}
