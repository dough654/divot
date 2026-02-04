import { useState, useCallback, useRef } from 'react';
import { MediaStream } from 'react-native-webrtc';
import { VisionCameraWebRTCBridgeModule } from '../../modules/vision-camera-webrtc-bridge/src';
import type { VisionCameraTrackInfo } from '../../modules/vision-camera-webrtc-bridge/src';

export type UseVisionCameraStreamResult = {
  /** MediaStream wrapping the native WebRTC video track, or null if not started */
  stream: MediaStream | null;
  /** Whether the stream has been created and is ready to be added to a peer connection */
  isReady: boolean;
  /** Error message if stream creation failed */
  error: string | null;
  /** Create the native video track and wrap it in a MediaStream */
  startStream: () => Promise<void>;
  /** Stop forwarding frames and release the stream */
  stopStream: () => void;
};

/**
 * Wraps the native VisionCameraWebRTCBridge module in a React hook.
 *
 * `startStream()` creates a native WebRTC video track backed by VisionCamera
 * frame processor frames. The returned `stream` can be passed as `localStream`
 * to `useWebRTCConnection`, which handles `addTrack()`.
 */
export const useVisionCameraStream = (): UseVisionCameraStreamResult => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trackInfoRef = useRef<VisionCameraTrackInfo | null>(null);

  const startStream = useCallback(async () => {
    try {
      setError(null);

      const trackInfo = await VisionCameraWebRTCBridgeModule.createVisionCameraTrack();
      trackInfoRef.current = trackInfo;

      // Construct a MediaStream from the native track info.
      // The native module registered the track and stream in react-native-webrtc's
      // internal maps, so we can reference them by ID using the info constructor.
      const mediaStream = new MediaStream({
        streamId: trackInfo.streamId,
        streamReactTag: trackInfo.streamId,
        tracks: [
          {
            id: trackInfo.track.id,
            kind: trackInfo.track.kind,
            remote: false,
            constraints: {},
            enabled: trackInfo.track.enabled,
            settings: trackInfo.track.settings,
            peerConnectionId: -1,
            readyState: trackInfo.track.readyState,
          },
        ],
      });

      setStream(mediaStream);
      setIsReady(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create vision camera stream';
      setError(message);
      console.error('useVisionCameraStream: startStream failed:', err);
    }
  }, []);

  const stopStream = useCallback(() => {
    VisionCameraWebRTCBridgeModule.stopForwarding();
    setStream(null);
    setIsReady(false);
    trackInfoRef.current = null;
  }, []);

  return {
    stream,
    isReady,
    error,
    startStream,
    stopStream,
  };
};
