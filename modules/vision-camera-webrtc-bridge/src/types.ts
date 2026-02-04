/** Info about a locally-created WebRTC video track and its associated stream. */
export type VisionCameraTrackInfo = {
  streamId: string;
  track: {
    id: string;
    kind: 'video';
    enabled: boolean;
    readyState: 'live' | 'ended';
    settings: Record<string, unknown>;
  };
};
