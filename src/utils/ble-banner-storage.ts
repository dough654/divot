import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@swinglink/ble-banner-dismissed';

/** Returns true if the user has previously dismissed the BLE permission banner. */
export const getBannerDismissed = async (): Promise<boolean> => {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  return value === 'true';
};

/** Persists that the user dismissed the BLE permission banner. */
export const setBannerDismissed = async (): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEY, 'true');
};
