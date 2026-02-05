/**
 * Mock RTCPeerConnection for integration testing.
 * Simulates WebRTC behavior without actual network connections.
 */

import type { SDPInfo, IceCandidateInfo, IceConnectionState } from '@/src/types';

export type MockPeerConnectionCallbacks = {
  onIceCandidate?: (candidate: IceCandidateInfo) => void;
  onIceConnectionStateChange?: (state: IceConnectionState) => void;
  onConnectionStateChange?: (state: string) => void;
  onTrack?: (stream: MockMediaStream) => void;
  onDataChannel?: (channel: MockDataChannel) => void;
};

export class MockMediaStream {
  id: string;
  tracks: MockMediaStreamTrack[];

  constructor(id = 'mock-stream-1') {
    this.id = id;
    this.tracks = [new MockMediaStreamTrack('video'), new MockMediaStreamTrack('audio')];
  }

  getTracks(): MockMediaStreamTrack[] {
    return this.tracks;
  }

  getVideoTracks(): MockMediaStreamTrack[] {
    return this.tracks.filter((t) => t.kind === 'video');
  }

  getAudioTracks(): MockMediaStreamTrack[] {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
}

export class MockMediaStreamTrack {
  kind: 'video' | 'audio';
  id: string;
  enabled: boolean;

  constructor(kind: 'video' | 'audio') {
    this.kind = kind;
    this.id = `mock-${kind}-track`;
    this.enabled = true;
  }

  stop(): void {
    this.enabled = false;
  }
}

export class MockDataChannel {
  label: string;
  readyState: 'connecting' | 'open' | 'closing' | 'closed';
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: { error: Error }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  private sentMessages: string[] = [];

  constructor(label: string) {
    this.label = label;
    this.readyState = 'connecting';
  }

  send(data: string): void {
    if (this.readyState !== 'open') {
      throw new Error('Data channel not open');
    }
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = 'closed';
    this.onclose?.();
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = 'open';
    this.onopen?.();
  }

  simulateMessage(data: string): void {
    this.onmessage?.({ data });
  }

  getSentMessages(): string[] {
    return [...this.sentMessages];
  }
}

export class MockRTCPeerConnection {
  iceConnectionState: IceConnectionState = 'new';
  connectionState: string = 'new';
  signalingState: string = 'stable';
  localDescription: SDPInfo | null = null;
  remoteDescription: SDPInfo | null = null;

  private callbacks: MockPeerConnectionCallbacks;
  private senders: MockRTCRtpSender[] = [];
  private dataChannels: MockDataChannel[] = [];
  private pendingIceCandidates: IceCandidateInfo[] = [];

  constructor(callbacks: MockPeerConnectionCallbacks = {}) {
    this.callbacks = callbacks;
  }

  // Standard WebRTC methods
  async createOffer(options?: { iceRestart?: boolean }): Promise<{ type: string; sdp: string }> {
    const sdp = this.generateMockSdp('offer', options?.iceRestart);
    return { type: 'offer', sdp };
  }

  async createAnswer(): Promise<{ type: string; sdp: string }> {
    if (!this.remoteDescription) {
      throw new Error('Cannot create answer without remote description');
    }
    const sdp = this.generateMockSdp('answer');
    return { type: 'answer', sdp };
  }

  async setLocalDescription(desc: { type: string; sdp: string }): Promise<void> {
    this.localDescription = { type: desc.type as 'offer' | 'answer', sdp: desc.sdp };
    this.signalingState = desc.type === 'offer' ? 'have-local-offer' : 'stable';

    // Simulate ICE gathering - emit candidates
    setTimeout(() => {
      this.emitIceCandidate({
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.100 54321 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      });
    }, 10);
  }

  async setRemoteDescription(desc: { type: string; sdp: string }): Promise<void> {
    this.remoteDescription = { type: desc.type as 'offer' | 'answer', sdp: desc.sdp };
    this.signalingState = 'stable';

    // Process any pending ICE candidates
    for (const candidate of this.pendingIceCandidates) {
      await this.addIceCandidate(candidate);
    }
    this.pendingIceCandidates = [];
  }

  async addIceCandidate(candidate: IceCandidateInfo): Promise<void> {
    if (!this.remoteDescription) {
      this.pendingIceCandidates.push(candidate);
      return;
    }
    // In real WebRTC, this would process the candidate
  }

  addTrack(track: MockMediaStreamTrack, _stream: MockMediaStream): MockRTCRtpSender {
    const sender = new MockRTCRtpSender(track);
    this.senders.push(sender);
    return sender;
  }

  getSenders(): MockRTCRtpSender[] {
    return this.senders;
  }

  createDataChannel(label: string): MockDataChannel {
    const channel = new MockDataChannel(label);
    this.dataChannels.push(channel);
    return channel;
  }

  close(): void {
    this.iceConnectionState = 'closed';
    this.connectionState = 'closed';
    for (const channel of this.dataChannels) {
      channel.close();
    }
  }

  // Test simulation methods
  simulateIceConnectionStateChange(state: IceConnectionState): void {
    this.iceConnectionState = state;
    this.callbacks.onIceConnectionStateChange?.(state);
  }

  simulateConnectionStateChange(state: string): void {
    this.connectionState = state;
    this.callbacks.onConnectionStateChange?.(state);
  }

  simulateRemoteTrack(stream?: MockMediaStream): void {
    const remoteStream = stream ?? new MockMediaStream('remote-stream');
    this.callbacks.onTrack?.(remoteStream);
  }

  simulateDataChannel(label: string): MockDataChannel {
    const channel = new MockDataChannel(label);
    this.dataChannels.push(channel);
    this.callbacks.onDataChannel?.(channel);
    return channel;
  }

  simulateConnectionSuccess(): void {
    this.simulateIceConnectionStateChange('checking');
    setTimeout(() => {
      this.simulateIceConnectionStateChange('connected');
      this.simulateConnectionStateChange('connected');
    }, 50);
  }

  simulateConnectionFailure(): void {
    this.simulateIceConnectionStateChange('checking');
    setTimeout(() => {
      this.simulateIceConnectionStateChange('failed');
      this.simulateConnectionStateChange('failed');
    }, 50);
  }

  private emitIceCandidate(candidate: IceCandidateInfo): void {
    this.callbacks.onIceCandidate?.(candidate);
  }

  private generateMockSdp(type: 'offer' | 'answer', iceRestart = false): string {
    const sessionId = Math.floor(Math.random() * 1000000);
    return `v=0
o=- ${sessionId} 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0 1
a=ice-options:trickle${iceRestart ? ' ice-restart' : ''}
m=video 9 UDP/TLS/RTP/SAVPF 96
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=ice-ufrag:mock${sessionId}
a=ice-pwd:mockpassword${sessionId}
a=fingerprint:sha-256 mock:fingerprint
a=setup:${type === 'offer' ? 'actpass' : 'active'}
a=mid:0
a=sendrecv
a=rtcp-mux
a=rtpmap:96 VP8/90000
m=audio 9 UDP/TLS/RTP/SAVPF 111
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=mid:1
a=sendrecv
a=rtcp-mux
a=rtpmap:111 opus/48000/2`;
  }
}

export class MockRTCRtpSender {
  track: MockMediaStreamTrack | null;
  private parameters: MockRTCRtpSendParameters;

  constructor(track: MockMediaStreamTrack) {
    this.track = track;
    this.parameters = {
      encodings: [{ active: true }],
      transactionId: 'mock-transaction-id',
      degradationPreference: null,
    };
  }

  getParameters(): MockRTCRtpSendParameters {
    return { ...this.parameters };
  }

  async setParameters(params: MockRTCRtpSendParameters): Promise<void> {
    this.parameters = { ...params };
  }

  async replaceTrack(track: MockMediaStreamTrack | null): Promise<void> {
    this.track = track;
  }
}

export type MockRTCRtpSendParameters = {
  encodings: Array<{
    active?: boolean;
    maxBitrate?: number;
    maxFramerate?: number;
    scaleResolutionDownBy?: number;
  }>;
  transactionId: string;
  degradationPreference: 'maintain-framerate' | 'maintain-resolution' | 'balanced' | null;
};

/**
 * Creates a pair of mock peer connections that can simulate a full connection.
 * When one creates an offer, it can be fed to the other to create an answer.
 */
export const createMockPeerConnectionPair = (): {
  camera: MockRTCPeerConnection;
  viewer: MockRTCPeerConnection;
  simulateFullHandshake: () => Promise<void>;
} => {
  let cameraCallbacks: MockPeerConnectionCallbacks = {};
  let viewerCallbacks: MockPeerConnectionCallbacks = {};

  const camera = new MockRTCPeerConnection(cameraCallbacks);
  const viewer = new MockRTCPeerConnection(viewerCallbacks);

  const simulateFullHandshake = async (): Promise<void> => {
    // Camera creates offer
    const offer = await camera.createOffer();
    await camera.setLocalDescription(offer);

    // Viewer receives offer and creates answer
    await viewer.setRemoteDescription(offer);
    const answer = await viewer.createAnswer();
    await viewer.setLocalDescription(answer);

    // Camera receives answer
    await camera.setRemoteDescription(answer);

    // Simulate successful connection on both sides
    camera.simulateConnectionSuccess();
    viewer.simulateConnectionSuccess();

    // Simulate remote tracks
    camera.simulateRemoteTrack();
    viewer.simulateRemoteTrack();
  };

  return { camera, viewer, simulateFullHandshake };
};
