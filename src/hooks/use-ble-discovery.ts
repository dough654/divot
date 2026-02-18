import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { SwingLinkBLEModule } from '../../modules/swinglink-ble';
import type { DiscoveredDevice } from '../../modules/swinglink-ble';

export type BLEPermissionStatus = 'unknown' | 'granted' | 'denied';

export type UseBLEAdvertisingOptions = {
  /** Room code to embed in the BLE advertisement. */
  roomCode: string;
  /** Whether to start advertising immediately. Defaults to true. */
  enabled?: boolean;
};

export type UseBLEAdvertisingResult = {
  /** Whether BLE permissions are granted. */
  permissionStatus: BLEPermissionStatus;
  /** Whether we are currently advertising. */
  isAdvertising: boolean;
};

export type UseBLEScanningOptions = {
  /** Whether to start scanning immediately. Defaults to true. */
  enabled?: boolean;
};

export type UseBLEScanningResult = {
  /** Whether BLE permissions are granted. */
  permissionStatus: BLEPermissionStatus;
  /** Whether we are currently scanning. */
  isScanning: boolean;
  /** Discovered devices sorted by signal strength (strongest first). */
  devices: ReadonlyArray<DiscoveredDevice>;
};

// Expo SDK 52+ — requireNativeModule() returns an object that IS an EventEmitter.
// Using RN's NativeEventEmitter with an Expo module would silently drop all events.
const bleModule = SwingLinkBLEModule as unknown as {
  addListener: (eventName: string, listener: (...args: any[]) => void) => { remove: () => void };
  startAdvertising: (roomCode: string) => void;
  stopAdvertising: () => void;
  startScanning: () => void;
  stopScanning: () => void;
};

/**
 * Requests BLE permissions on Android (API 31+).
 * On iOS, CoreBluetooth triggers the system prompt automatically.
 */
const requestBLEPermissions = async (): Promise<BLEPermissionStatus> => {
  if (Platform.OS === 'ios') {
    // iOS handles permissions via CoreBluetooth + Info.plist key.
    // The prompt appears when the native module creates a CBManager.
    return 'granted';
  }

  if (Platform.OS !== 'android') {
    return 'denied';
  }

  // Android 12+ (API 31) requires runtime BLE permissions.
  // ACCESS_FINE_LOCATION is also needed on Samsung devices even on API 31+
  // for BLE scan results to be delivered.
  if (Platform.Version >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);

    const allGranted = Object.values(results).every(
      (r) => r === PermissionsAndroid.RESULTS.GRANTED
    );
    return allGranted ? 'granted' : 'denied';
  }

  // Android < 12 needs location for BLE scanning
  const locationResult = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  return locationResult === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
};

/**
 * Hook for BLE advertising (camera side).
 *
 * Starts advertising the given room code on mount (if permissions are granted)
 * and stops on unmount. If permissions are not granted, silently does nothing —
 * the camera screen falls back to QR-only discovery.
 */
export const useBLEAdvertising = (
  options: UseBLEAdvertisingOptions
): UseBLEAdvertisingResult => {
  const { roomCode, enabled = true } = options;
  const [permissionStatus, setPermissionStatus] = useState<BLEPermissionStatus>('unknown');
  const [isAdvertising, setIsAdvertising] = useState(false);
  const isAdvertisingRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    const start = async () => {
      const status = await requestBLEPermissions();
      if (cancelled) return;
      setPermissionStatus(status);

      if (status !== 'granted') return;

      try {
        bleModule.startAdvertising(roomCode);
        isAdvertisingRef.current = true;
        setIsAdvertising(true);
      } catch (error) {
        console.error('[BLE] startAdvertising failed:', error);
      }
    };

    start();

    return () => {
      cancelled = true;
      if (isAdvertisingRef.current) {
        try {
          bleModule.stopAdvertising();
        } catch (error) {
          console.error('[BLE] stopAdvertising failed:', error);
        }
        isAdvertisingRef.current = false;
      }
      setIsAdvertising(false);
    };
  // Intentionally re-run when roomCode changes (new room = new advertisement)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, enabled]);

  return { permissionStatus, isAdvertising };
};

/**
 * Hook for BLE scanning (viewer side).
 *
 * Starts scanning for nearby Divot advertisers on mount and maintains a
 * list of discovered devices sorted by signal strength. Stops scanning on
 * unmount. If permissions are not granted, silently returns an empty list —
 * the viewer screen falls back to QR-only discovery.
 */
export const useBLEScanning = (
  options: UseBLEScanningOptions = {}
): UseBLEScanningResult => {
  const { enabled = true } = options;
  const [permissionStatus, setPermissionStatus] = useState<BLEPermissionStatus>('unknown');
  const [isScanning, setIsScanning] = useState(false);
  const devicesRef = useRef<Map<string, DiscoveredDevice>>(new Map());
  const cleanupRef = useRef<(() => void) | null>(null);
  const [devices, setDevices] = useState<ReadonlyArray<DiscoveredDevice>>([]);

  const sortAndSetDevices = useCallback(() => {
    const sorted = Array.from(devicesRef.current.values()).sort(
      (a, b) => b.rssi - a.rssi // Strongest signal first (RSSI is negative, closer to 0 = stronger)
    );
    setDevices(sorted);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    const start = async () => {
      const status = await requestBLEPermissions();
      if (cancelled) return;
      setPermissionStatus(status);

      if (status !== 'granted') return;

      const foundSubscription = bleModule.addListener(
        'onDeviceFound',
        (device: DiscoveredDevice) => {
          devicesRef.current.set(device.id, device);
          sortAndSetDevices();
        }
      );

      const lostSubscription = bleModule.addListener(
        'onDeviceLost',
        (event: { id: string }) => {
          devicesRef.current.delete(event.id);
          sortAndSetDevices();
        }
      );

      try {
        bleModule.startScanning();
      } catch (error) {
        console.error('[BLE] startScanning failed:', error);
      }
      setIsScanning(true);

      cleanupRef.current = () => {
        foundSubscription.remove();
        lostSubscription.remove();
        try {
          bleModule.stopScanning();
        } catch (error) {
          console.error('[BLE] stopScanning failed:', error);
        }
        devicesRef.current.clear();
        setDevices([]);
        setIsScanning(false);
      };
    };

    start();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { permissionStatus, isScanning, devices };
};
