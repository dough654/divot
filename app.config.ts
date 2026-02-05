import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  name: 'SwingLink',
  slug: 'swing-app',
  version: '1.0.0',
  orientation: 'default',
  icon: './assets/images/icon.png',
  scheme: 'swinglink',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/images/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#1a1a2e',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.swinglink.app',
    infoPlist: {
      NSCameraUsageDescription: 'SwingLink needs camera access to film and stream your golf swing.',
      NSMicrophoneUsageDescription: 'SwingLink needs microphone access for audio during video streaming.',
      NSLocalNetworkUsageDescription: 'SwingLink uses local network to discover and connect to nearby devices.',
      NSBonjourServices: ['_swinglink._tcp'],
      NSPhotoLibraryUsageDescription: 'SwingLink needs photo library access to save recorded swing videos.',
      NSPhotoLibraryAddUsageDescription: 'SwingLink needs photo library access to save recorded swing videos.',
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#1a1a2e',
    },
    package: 'com.swinglink.app',
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
    ],
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      '@config-plugins/react-native-webrtc',
      {
        cameraPermission: 'SwingLink needs camera access to film and stream your golf swing.',
        microphonePermission: 'SwingLink needs microphone access for audio during video streaming.',
      },
    ],
    [
      'react-native-vision-camera',
      {
        cameraPermissionText: 'SwingLink needs camera access to record your golf swing.',
        enableCodeScanner: true,
        enableMicrophonePermission: true,
        microphonePermissionText: 'SwingLink needs microphone access to record audio with your swing videos.',
      },
    ],
    'expo-screen-orientation',
    [
      'expo-media-library',
      {
        photosPermission: 'SwingLink needs photo library access to save recorded swing videos.',
        savePhotosPermission: 'SwingLink needs permission to save recorded swing videos to your library.',
        isAccessMediaLocationEnabled: true,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    signalingServerUrl: process.env.SIGNALING_SERVER_URL || 'https://swinglink-signaling.fly.dev',
    eas: {
      projectId: '35da25d9-0965-4058-8a6e-cfe1a9a385d1',
    },
  },
});
