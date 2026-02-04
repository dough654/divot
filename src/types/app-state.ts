export type ConnectionMode = 'auto' | 'hotspot';

export type AppRole = 'camera' | 'viewer';

export type ConnectionStep =
  | 'idle'
  | 'generating-session'
  | 'displaying-qr'
  | 'scanning-qr'
  | 'discovering-local'
  | 'local-discovery-failed'
  | 'setting-up-hotspot'
  | 'connecting-to-hotspot'
  | 'exchanging-signaling'
  | 'establishing-webrtc'
  | 'connected'
  | 'reconnecting'
  | 'reconnect-failed'
  | 'failed';

export type ReconnectionStrategy = 'ice-restart' | 'renegotiation' | 'signaling-rejoin';

export type ReconnectionState = {
  isReconnecting: boolean;
  attempt: number;
  maxAttempts: number;
  lastDisconnectReason: string | null;
  strategy: ReconnectionStrategy | null;
};

export type ConnectionCascadeState = {
  step: ConnectionStep;
  mode: ConnectionMode;
  sessionId: string | null;
  localIpAddress: string | null;
  hotspotSsid: string | null;
  hotspotPassword: string | null;
  errorMessage: string | null;
};

export type QRCodePayload = {
  sessionId: string;
  mode: ConnectionMode;
  hotspotSsid?: string;
  hotspotPassword?: string;
  localIp?: string;
  signalingUrl?: string;
};

export type LocalDiscoveryService = {
  name: string;
  type: string;
  host: string;
  port: number;
  addresses: string[];
  txt: Record<string, string>;
};

export type LocalDiscoveryState = {
  isPublishing: boolean;
  isBrowsing: boolean;
  discoveredServices: LocalDiscoveryService[];
  error: string | null;
};
