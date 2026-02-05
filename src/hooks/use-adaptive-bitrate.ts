import { useEffect, useCallback, useRef, useState } from 'react';
import { RTCPeerConnection } from 'react-native-webrtc';
import type { ConnectionQuality } from '@/src/types';
import { getQualityRating } from './use-connection-quality';

/**
 * Quality presets for adaptive bitrate control.
 * Each preset defines encoding parameters for different network conditions.
 */
export type QualityPreset = 'high' | 'medium' | 'low';

export type EncodingParameters = {
  maxBitrate: number;
  scaleResolutionDownBy: number;
  maxFramerate: number;
};

/**
 * Quality presets optimized for golf swing video streaming.
 * High quality: Full resolution at 60fps for smooth playback
 * Medium quality: Reduced bitrate, slightly scaled resolution
 * Low quality: Significantly reduced for poor networks
 */
export const qualityPresets: Record<QualityPreset, EncodingParameters> = {
  high: {
    maxBitrate: 2_500_000, // 2.5 Mbps
    scaleResolutionDownBy: 1.0,
    maxFramerate: 60,
  },
  medium: {
    maxBitrate: 1_500_000, // 1.5 Mbps
    scaleResolutionDownBy: 1.5,
    maxFramerate: 30,
  },
  low: {
    maxBitrate: 500_000, // 500 Kbps
    scaleResolutionDownBy: 2.0,
    maxFramerate: 24,
  },
};

export type UseAdaptiveBitrateOptions = {
  peerConnection: RTCPeerConnection | null;
  quality: ConnectionQuality | null;
  enabled?: boolean;
  /** Minimum time between quality changes (ms) to prevent oscillation */
  stabilizationPeriodMs?: number;
};

export type UseAdaptiveBitrateResult = {
  currentPreset: QualityPreset;
  isAdjusting: boolean;
  /** Force a specific quality preset (disables auto-adjustment) */
  setManualPreset: (preset: QualityPreset | null) => void;
  /** Current encoding parameters being used */
  currentParameters: EncodingParameters | null;
};

/**
 * Hook for adaptive bitrate control based on network quality.
 * Monitors connection quality and adjusts video encoding parameters
 * to maintain a stable stream on poor networks.
 */
export const useAdaptiveBitrate = (
  options: UseAdaptiveBitrateOptions
): UseAdaptiveBitrateResult => {
  const {
    peerConnection,
    quality,
    enabled = true,
    stabilizationPeriodMs = 5000,
  } = options;

  const [currentPreset, setCurrentPreset] = useState<QualityPreset>('high');
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [manualPreset, setManualPreset] = useState<QualityPreset | null>(null);
  const [currentParameters, setCurrentParameters] = useState<EncodingParameters | null>(null);

  const lastChangeTimeRef = useRef<number>(0);
  const consecutiveGoodReadingsRef = useRef<number>(0);

  /**
   * Gets the video sender from the peer connection.
   */
  const getVideoSender = useCallback(() => {
    if (!peerConnection) return null;

    const senders = peerConnection.getSenders();
    return senders.find((sender) => sender.track?.kind === 'video') ?? null;
  }, [peerConnection]);

  /**
   * Applies encoding parameters to the video sender.
   */
  const applyEncodingParameters = useCallback(async (
    preset: QualityPreset
  ): Promise<boolean> => {
    const sender = getVideoSender();
    if (!sender) return false;

    try {
      setIsAdjusting(true);
      const params = sender.getParameters();
      const presetParams = qualityPresets[preset];

      // Ensure encodings array exists and has at least one entry
      if (!params.encodings || params.encodings.length === 0) {
        // Can't modify parameters without encodings
        console.warn('No encodings found in sender parameters');
        return false;
      }

      // Apply preset parameters to all encodings
      for (const encoding of params.encodings) {
        encoding.maxBitrate = presetParams.maxBitrate;
        encoding.scaleResolutionDownBy = presetParams.scaleResolutionDownBy;
        encoding.maxFramerate = presetParams.maxFramerate;
      }

      // Prefer maintaining framerate for golf swing analysis
      params.degradationPreference = 'maintain-framerate';

      await sender.setParameters(params);
      setCurrentPreset(preset);
      setCurrentParameters(presetParams);
      lastChangeTimeRef.current = Date.now();

      return true;
    } catch (error) {
      console.warn('Failed to apply encoding parameters:', error);
      return false;
    } finally {
      setIsAdjusting(false);
    }
  }, [getVideoSender]);

  /**
   * Determines the appropriate quality preset based on connection quality.
   */
  const getTargetPreset = useCallback((q: ConnectionQuality | null): QualityPreset => {
    const rating = getQualityRating(q);

    switch (rating) {
      case 'excellent':
      case 'good':
        return 'high';
      case 'fair':
        return 'medium';
      case 'poor':
        return 'low';
      default:
        return 'high';
    }
  }, []);

  /**
   * Main effect for automatic quality adjustment.
   */
  useEffect(() => {
    if (!enabled || !peerConnection || manualPreset !== null) return;

    const targetPreset = getTargetPreset(quality);
    const timeSinceLastChange = Date.now() - lastChangeTimeRef.current;

    // Require stabilization period before changing quality
    if (timeSinceLastChange < stabilizationPeriodMs) return;

    // For downgrade: react immediately after stabilization
    // For upgrade: require consecutive good readings to prevent oscillation
    if (targetPreset !== currentPreset) {
      const isDowngrade =
        (currentPreset === 'high' && targetPreset !== 'high') ||
        (currentPreset === 'medium' && targetPreset === 'low');

      if (isDowngrade) {
        // Downgrade immediately if quality is poor
        consecutiveGoodReadingsRef.current = 0;
        applyEncodingParameters(targetPreset);
      } else {
        // Upgrade requires 3 consecutive good readings
        consecutiveGoodReadingsRef.current++;
        if (consecutiveGoodReadingsRef.current >= 3) {
          consecutiveGoodReadingsRef.current = 0;
          applyEncodingParameters(targetPreset);
        }
      }
    } else {
      // Reset counter if we're at target
      consecutiveGoodReadingsRef.current = 0;
    }
  }, [
    enabled,
    peerConnection,
    quality,
    currentPreset,
    manualPreset,
    stabilizationPeriodMs,
    getTargetPreset,
    applyEncodingParameters,
  ]);

  /**
   * Apply manual preset when set.
   */
  useEffect(() => {
    if (manualPreset !== null && peerConnection) {
      applyEncodingParameters(manualPreset);
    }
  }, [manualPreset, peerConnection, applyEncodingParameters]);

  /**
   * Initialize with high quality when peer connection becomes available.
   */
  useEffect(() => {
    if (peerConnection && enabled) {
      // Small delay to ensure tracks are added
      const timer = setTimeout(() => {
        applyEncodingParameters('high');
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [peerConnection, enabled]);

  const handleSetManualPreset = useCallback((preset: QualityPreset | null) => {
    setManualPreset(preset);
    consecutiveGoodReadingsRef.current = 0;
  }, []);

  return {
    currentPreset: manualPreset ?? currentPreset,
    isAdjusting,
    setManualPreset: handleSetManualPreset,
    currentParameters,
  };
};

/**
 * Gets a human-readable label for a quality preset.
 */
export const getPresetLabel = (preset: QualityPreset): string => {
  switch (preset) {
    case 'high':
      return 'HD (60fps)';
    case 'medium':
      return 'SD (30fps)';
    case 'low':
      return 'Low (24fps)';
  }
};
