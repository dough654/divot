import { useState, useEffect, useCallback, useRef } from 'react';
import { RTCPeerConnection } from 'react-native-webrtc';
import type { ConnectionQuality } from '@/src/types';

const STATS_INTERVAL_MS = 1000;

export type UseConnectionQualityOptions = {
  peerConnection: RTCPeerConnection | null;
  enabled?: boolean;
};

export type UseConnectionQualityResult = {
  quality: ConnectionQuality | null;
  isMonitoring: boolean;
  startMonitoring: () => void;
  stopMonitoring: () => void;
};

const initialQuality: ConnectionQuality = {
  latencyMs: 0,
  bitrateBps: 0,
  packetLossPercent: 0,
  jitterMs: 0,
  timestamp: 0,
};

/**
 * Hook for monitoring WebRTC connection quality.
 * Tracks latency, bitrate, packet loss, and jitter.
 */
export const useConnectionQuality = (
  options: UseConnectionQualityOptions
): UseConnectionQualityResult => {
  const { peerConnection, enabled = true } = options;

  const [quality, setQuality] = useState<ConnectionQuality | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousStatsRef = useRef<{
    bytesReceived: number;
    packetsReceived: number;
    packetsLost: number;
    timestamp: number;
  } | null>(null);

  const collectStats = useCallback(async () => {
    if (!peerConnection) return;

    try {
      const stats = await peerConnection.getStats();
      let newQuality: ConnectionQuality = { ...initialQuality, timestamp: Date.now() };

      stats.forEach((report: Record<string, unknown>) => {
        // Look for inbound-rtp stats (for viewer receiving video)
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          const bytesReceived = (report.bytesReceived as number) || 0;
          const packetsReceived = (report.packetsReceived as number) || 0;
          const packetsLost = (report.packetsLost as number) || 0;
          const jitter = (report.jitter as number) || 0;

          if (previousStatsRef.current) {
            const timeDelta = (Date.now() - previousStatsRef.current.timestamp) / 1000;
            const bytesDelta = bytesReceived - previousStatsRef.current.bytesReceived;
            const packetsReceivedDelta = packetsReceived - previousStatsRef.current.packetsReceived;
            const packetsLostDelta = packetsLost - previousStatsRef.current.packetsLost;

            // Calculate bitrate (bits per second)
            newQuality.bitrateBps = Math.round((bytesDelta * 8) / timeDelta);

            // Calculate packet loss percentage
            const totalPackets = packetsReceivedDelta + packetsLostDelta;
            if (totalPackets > 0) {
              newQuality.packetLossPercent = Math.round((packetsLostDelta / totalPackets) * 100);
            }

            // Jitter in milliseconds
            newQuality.jitterMs = Math.round(jitter * 1000);
          }

          previousStatsRef.current = {
            bytesReceived,
            packetsReceived,
            packetsLost,
            timestamp: Date.now(),
          };
        }

        // Look for candidate-pair stats for RTT/latency
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          const rtt = (report.currentRoundTripTime as number) || 0;
          newQuality.latencyMs = Math.round(rtt * 1000);
        }
      });

      setQuality(newQuality);
    } catch (error) {
      console.error('Failed to collect WebRTC stats:', error);
    }
  }, [peerConnection]);

  const startMonitoring = useCallback(() => {
    if (intervalRef.current || !peerConnection) return;

    setIsMonitoring(true);
    previousStatsRef.current = null;

    // Collect initial stats
    collectStats();

    // Start periodic collection
    intervalRef.current = setInterval(collectStats, STATS_INTERVAL_MS);
  }, [peerConnection, collectStats]);

  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsMonitoring(false);
    previousStatsRef.current = null;
  }, []);

  // Auto-start monitoring when peer connection is available
  useEffect(() => {
    if (enabled && peerConnection) {
      startMonitoring();
    } else {
      stopMonitoring();
    }

    return () => {
      stopMonitoring();
    };
  }, [enabled, peerConnection, startMonitoring, stopMonitoring]);

  return {
    quality,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
  };
};

/**
 * Formats connection quality for display.
 */
export const formatQuality = (quality: ConnectionQuality | null): string => {
  if (!quality) return 'No data';

  const parts: string[] = [];

  if (quality.latencyMs > 0) {
    parts.push(`${quality.latencyMs}ms`);
  }

  if (quality.bitrateBps > 0) {
    const mbps = (quality.bitrateBps / 1_000_000).toFixed(1);
    parts.push(`${mbps} Mbps`);
  }

  if (quality.packetLossPercent > 0) {
    parts.push(`${quality.packetLossPercent}% loss`);
  }

  return parts.length > 0 ? parts.join(' | ') : 'Measuring...';
};

/**
 * Returns a quality rating based on the metrics.
 */
export const getQualityRating = (
  quality: ConnectionQuality | null
): 'excellent' | 'good' | 'fair' | 'poor' | 'unknown' => {
  if (!quality) return 'unknown';

  // Excellent: <50ms latency, <1% packet loss
  if (quality.latencyMs < 50 && quality.packetLossPercent < 1) {
    return 'excellent';
  }

  // Good: <100ms latency, <3% packet loss
  if (quality.latencyMs < 100 && quality.packetLossPercent < 3) {
    return 'good';
  }

  // Fair: <150ms latency, <5% packet loss
  if (quality.latencyMs < 150 && quality.packetLossPercent < 5) {
    return 'fair';
  }

  return 'poor';
};
