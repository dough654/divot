import * as Location from 'expo-location';
import type { SessionLocation } from '@/src/types/session';
import {
  hasAskedLocationPermission,
  setLocationPermissionAsked,
} from '@/src/services/session/session-storage';

/**
 * Attempts to get the device's current location for tagging a session.
 * Handles permission flow (asks once if never asked), reverse geocodes the result.
 * Returns undefined on any failure — never blocks session creation.
 */
export const getSessionLocation = async (): Promise<SessionLocation | undefined> => {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();

    if (status === 'undetermined') {
      const alreadyAsked = await hasAskedLocationPermission();
      if (alreadyAsked) return undefined;

      await setLocationPermissionAsked();
      const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
      if (newStatus !== 'granted') return undefined;
    } else if (status !== 'granted') {
      return undefined;
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
    });

    let displayName: string | null = null;
    try {
      const [geocode] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      if (geocode) {
        const parts = [geocode.city, geocode.region].filter(Boolean);
        displayName = parts.length > 0 ? parts.join(', ') : null;
      }
    } catch {
      // Reverse geocoding failure is non-fatal
    }

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      displayName,
    };
  } catch {
    return undefined;
  }
};
