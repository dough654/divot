/**
 * Integration tests for the WebRTC connection flow.
 * Tests the full handshake process using mock peer connections.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  MockRTCPeerConnection,
  MockMediaStream,
  MockDataChannel,
  createMockPeerConnectionPair,
} from './mock-peer-connection';

describe('MockRTCPeerConnection', () => {
  describe('offer/answer exchange', () => {
    it('creates a valid offer', async () => {
      const pc = new MockRTCPeerConnection();
      const offer = await pc.createOffer();

      expect(offer.type).toBe('offer');
      expect(offer.sdp).toContain('v=0');
      expect(offer.sdp).toContain('m=video');
      expect(offer.sdp).toContain('m=audio');
    });

    it('creates an answer after receiving offer', async () => {
      const pc = new MockRTCPeerConnection();
      const offer = { type: 'offer', sdp: 'mock-sdp' };

      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();

      expect(answer.type).toBe('answer');
      expect(answer.sdp).toContain('v=0');
    });

    it('throws when creating answer without remote description', async () => {
      const pc = new MockRTCPeerConnection();

      await expect(pc.createAnswer()).rejects.toThrow('Cannot create answer');
    });

    it('updates signaling state correctly', async () => {
      const pc = new MockRTCPeerConnection();

      expect(pc.signalingState).toBe('stable');

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      expect(pc.signalingState).toBe('have-local-offer');

      await pc.setRemoteDescription({ type: 'answer', sdp: 'mock-answer' });
      expect(pc.signalingState).toBe('stable');
    });
  });

  describe('ICE candidate handling', () => {
    it('emits ICE candidates after setting local description', async () => {
      const onIceCandidate = vi.fn();
      const pc = new MockRTCPeerConnection({ onIceCandidate });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for async ICE candidate emission
      await new Promise((r) => setTimeout(r, 50));

      expect(onIceCandidate).toHaveBeenCalled();
      const candidate = onIceCandidate.mock.calls[0][0];
      expect(candidate.candidate).toContain('candidate:');
      expect(candidate.sdpMid).toBe('0');
    });

    it('queues ICE candidates before remote description is set', async () => {
      const pc = new MockRTCPeerConnection();

      // Add candidate before remote description
      await pc.addIceCandidate({
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 12345 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      });

      // Should not throw, candidate is queued
      expect(pc.remoteDescription).toBeNull();
    });
  });

  describe('connection state simulation', () => {
    it('simulates successful connection', async () => {
      const onIceConnectionStateChange = vi.fn();
      const onConnectionStateChange = vi.fn();

      const pc = new MockRTCPeerConnection({
        onIceConnectionStateChange,
        onConnectionStateChange,
      });

      pc.simulateConnectionSuccess();

      // Wait for async state changes
      await new Promise((r) => setTimeout(r, 100));

      expect(onIceConnectionStateChange).toHaveBeenCalledWith('checking');
      expect(onIceConnectionStateChange).toHaveBeenCalledWith('connected');
      expect(pc.iceConnectionState).toBe('connected');
    });

    it('simulates connection failure', async () => {
      const onIceConnectionStateChange = vi.fn();

      const pc = new MockRTCPeerConnection({ onIceConnectionStateChange });

      pc.simulateConnectionFailure();

      await new Promise((r) => setTimeout(r, 100));

      expect(onIceConnectionStateChange).toHaveBeenCalledWith('failed');
      expect(pc.iceConnectionState).toBe('failed');
    });

    it('simulates remote track arrival', () => {
      const onTrack = vi.fn();
      const pc = new MockRTCPeerConnection({ onTrack });

      pc.simulateRemoteTrack();

      expect(onTrack).toHaveBeenCalled();
      const stream = onTrack.mock.calls[0][0];
      expect(stream.getTracks().length).toBeGreaterThan(0);
    });
  });

  describe('data channel', () => {
    it('creates data channel', () => {
      const pc = new MockRTCPeerConnection();
      const channel = pc.createDataChannel('test-channel');

      expect(channel.label).toBe('test-channel');
      expect(channel.readyState).toBe('connecting');
    });

    it('simulates incoming data channel', () => {
      const onDataChannel = vi.fn();
      const pc = new MockRTCPeerConnection({ onDataChannel });

      pc.simulateDataChannel('remote-channel');

      expect(onDataChannel).toHaveBeenCalled();
      const channel = onDataChannel.mock.calls[0][0];
      expect(channel.label).toBe('remote-channel');
    });
  });

  describe('senders and tracks', () => {
    it('adds tracks and returns senders', () => {
      const pc = new MockRTCPeerConnection();
      const stream = new MockMediaStream();
      const track = stream.getVideoTracks()[0];

      const sender = pc.addTrack(track, stream);

      expect(sender.track).toBe(track);
      expect(pc.getSenders()).toContain(sender);
    });

    it('allows modifying sender parameters', async () => {
      const pc = new MockRTCPeerConnection();
      const stream = new MockMediaStream();
      const track = stream.getVideoTracks()[0];

      const sender = pc.addTrack(track, stream);
      const params = sender.getParameters();

      params.encodings[0].maxBitrate = 1000000;
      params.degradationPreference = 'maintain-framerate';

      await sender.setParameters(params);

      const updatedParams = sender.getParameters();
      expect(updatedParams.encodings[0].maxBitrate).toBe(1000000);
      expect(updatedParams.degradationPreference).toBe('maintain-framerate');
    });
  });

  describe('close', () => {
    it('closes connection and data channels', () => {
      const pc = new MockRTCPeerConnection();
      const channel = pc.createDataChannel('test');

      pc.close();

      expect(pc.iceConnectionState).toBe('closed');
      expect(pc.connectionState).toBe('closed');
      expect(channel.readyState).toBe('closed');
    });
  });
});

describe('MockDataChannel', () => {
  it('starts in connecting state', () => {
    const channel = new MockDataChannel('test');
    expect(channel.readyState).toBe('connecting');
  });

  it('can be opened', () => {
    const channel = new MockDataChannel('test');
    const onopen = vi.fn();
    channel.onopen = onopen;

    channel.simulateOpen();

    expect(channel.readyState).toBe('open');
    expect(onopen).toHaveBeenCalled();
  });

  it('throws when sending on closed channel', () => {
    const channel = new MockDataChannel('test');

    expect(() => channel.send('test')).toThrow('Data channel not open');
  });

  it('can send messages when open', () => {
    const channel = new MockDataChannel('test');
    channel.simulateOpen();

    channel.send('message1');
    channel.send('message2');

    expect(channel.getSentMessages()).toEqual(['message1', 'message2']);
  });

  it('can receive messages', () => {
    const channel = new MockDataChannel('test');
    const onmessage = vi.fn();
    channel.onmessage = onmessage;

    channel.simulateMessage('hello');

    expect(onmessage).toHaveBeenCalledWith({ data: 'hello' });
  });
});

describe('createMockPeerConnectionPair', () => {
  it('creates camera and viewer connections', () => {
    const { camera, viewer } = createMockPeerConnectionPair();

    expect(camera).toBeInstanceOf(MockRTCPeerConnection);
    expect(viewer).toBeInstanceOf(MockRTCPeerConnection);
  });

  it('simulates full handshake', async () => {
    const { camera, viewer, simulateFullHandshake } = createMockPeerConnectionPair();

    await simulateFullHandshake();

    // Wait for async connection simulation
    await new Promise((r) => setTimeout(r, 100));

    expect(camera.iceConnectionState).toBe('connected');
    expect(viewer.iceConnectionState).toBe('connected');
    expect(camera.signalingState).toBe('stable');
    expect(viewer.signalingState).toBe('stable');
  });
});

describe('Connection flow scenarios', () => {
  describe('successful connection', () => {
    it('completes full camera -> viewer handshake', async () => {
      const { camera, viewer, simulateFullHandshake } = createMockPeerConnectionPair();

      await simulateFullHandshake();
      await new Promise((r) => setTimeout(r, 100));

      expect(camera.localDescription?.type).toBe('offer');
      expect(camera.remoteDescription?.type).toBe('answer');
      expect(viewer.localDescription?.type).toBe('answer');
      expect(viewer.remoteDescription?.type).toBe('offer');
    });
  });

  describe('ICE restart', () => {
    it('creates offer with ice-restart option', async () => {
      const pc = new MockRTCPeerConnection();

      const offer = await pc.createOffer({ iceRestart: true });

      expect(offer.sdp).toContain('ice-restart');
    });

    it('normal offer does not have ice-restart', async () => {
      const pc = new MockRTCPeerConnection();

      const offer = await pc.createOffer();

      expect(offer.sdp).not.toContain('ice-restart');
    });
  });

  describe('connection failure recovery', () => {
    it('detects ICE failure', async () => {
      const onIceConnectionStateChange = vi.fn();
      const pc = new MockRTCPeerConnection({ onIceConnectionStateChange });

      pc.simulateIceConnectionStateChange('checking');
      pc.simulateIceConnectionStateChange('failed');

      expect(onIceConnectionStateChange).toHaveBeenCalledWith('checking');
      expect(onIceConnectionStateChange).toHaveBeenCalledWith('failed');
    });

    it('can recover from disconnected state', async () => {
      const onIceConnectionStateChange = vi.fn();
      const pc = new MockRTCPeerConnection({ onIceConnectionStateChange });

      // Simulate disconnect and recovery
      pc.simulateIceConnectionStateChange('connected');
      pc.simulateIceConnectionStateChange('disconnected');
      pc.simulateIceConnectionStateChange('connected');

      expect(onIceConnectionStateChange).toHaveBeenCalledWith('disconnected');
      expect(onIceConnectionStateChange).toHaveBeenLastCalledWith('connected');
    });
  });

  describe('data channel in connection flow', () => {
    it('camera creates data channel with offer', () => {
      const pc = new MockRTCPeerConnection();
      const channel = pc.createDataChannel('clip-sync');

      expect(channel.label).toBe('clip-sync');
      expect(pc.getSenders).toBeDefined();
    });

    it('viewer receives data channel after answer', () => {
      const onDataChannel = vi.fn();
      const viewer = new MockRTCPeerConnection({ onDataChannel });

      // Camera would send offer with data channel
      // Viewer receives data channel event
      viewer.simulateDataChannel('clip-sync');

      expect(onDataChannel).toHaveBeenCalled();
      const channel = onDataChannel.mock.calls[0][0];
      expect(channel.label).toBe('clip-sync');
    });
  });
});
