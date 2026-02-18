import { ExpoConfig, ConfigContext } from 'expo/config';
import { config as loadEnv } from 'dotenv';

// Load .env.local if present (gitignored via .env*.local pattern)
loadEnv({ path: '.env.local' });

export default ({ config }: ConfigContext): ExpoConfig => ({
  name: 'Divot',
  slug: 'divot',
  version: '1.0.0',
  orientation: 'default',
  icon: './assets/images/icon.png',
  scheme: 'divot',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/images/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#000000',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.divotgolf.app',
    infoPlist: {
      NSCameraUsageDescription: 'Divot needs camera access to film and stream your golf swing.',
      NSMicrophoneUsageDescription: 'Divot needs microphone access for audio during video streaming.',
      NSLocalNetworkUsageDescription: 'Divot uses local network to discover and connect to nearby devices.',
      NSBonjourServices: ['_divot._tcp', '_divot-sig._tcp'],
      NSPhotoLibraryUsageDescription: 'Divot needs photo library access to save recorded swing videos.',
      NSPhotoLibraryAddUsageDescription: 'Divot needs photo library access to save recorded swing videos.',
      NSBluetoothAlwaysUsageDescription: 'Divot uses Bluetooth to discover nearby devices for pairing.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#000000',
    },
    package: 'com.divotgolf.app',
    permissions: [
      'CAMERA',
      'RECORD_AUDIO',
      'MODIFY_AUDIO_SETTINGS',
      'ACCESS_NETWORK_STATE',
      'ACCESS_WIFI_STATE',
      'CHANGE_WIFI_STATE',
      'INTERNET',
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
      'BLUETOOTH_ADVERTISE',
      'BLUETOOTH_SCAN',
      'BLUETOOTH_CONNECT',
      'ACCESS_FINE_LOCATION',
      'NEARBY_WIFI_DEVICES',
    ],
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-screen-orientation',
    [
      '@config-plugins/react-native-webrtc',
      {
        cameraPermission: 'Divot needs camera access to film and stream your golf swing.',
        microphonePermission: 'Divot needs microphone access for audio during video streaming.',
      },
    ],
    [
      'react-native-vision-camera',
      {
        cameraPermissionText: 'Divot needs camera access to record your golf swing.',
        enableCodeScanner: true,
        enableMicrophonePermission: true,
        microphonePermissionText: 'Divot needs microphone access to record audio with your swing videos.',
      },
    ],
    'expo-apple-authentication',
    [
      'expo-media-library',
      {
        photosPermission: 'Divot needs photo library access to save recorded swing videos.',
        savePhotosPermission: 'Divot needs permission to save recorded swing videos to your library.',
        isAccessMediaLocationEnabled: true,
      },
    ],
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Divot uses your location to tag practice sessions.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    signalingServerUrl: process.env.SIGNALING_SERVER_URL || 'https://divot-signaling.fly.dev',
    apiBaseUrl: process.env.API_BASE_URL || 'https://divot-api.fly.dev',
    appEnv: process.env.APP_ENV || 'development',
    posthogApiKey: process.env.POSTHOG_API_KEY || '',
    eas: {
      projectId: '35da25d9-0965-4058-8a6e-cfe1a9a385d1',
    },
  },
});
