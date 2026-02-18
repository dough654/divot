/** A BLE-discovered nearby device. */
export type DiscoveredDevice = {
  /** Platform-assigned peripheral/device identifier. */
  id: string;
  /** Advertised device name (may be truncated by BLE stack). */
  name: string | null;
  /** Platform of the advertising device. */
  platform: 'ios' | 'android';
  /** Room code extracted from BLE payload. */
  roomCode: string;
  /** Received Signal Strength Indicator in dBm. */
  rssi: number;
  /** Timestamp (ms) of last sighting. */
  lastSeen: number;
};

/** Parameters for starting BLE advertising. */
export type AdvertisingParams = {
  /** Room code to embed in the BLE payload (max 6 ASCII chars). */
  roomCode: string;
};

/** Events emitted by the DivotBLE native module. */
export type DivotBLEEvents = {
  onDeviceFound: DiscoveredDevice;
  onDeviceLost: { id: string };
};
