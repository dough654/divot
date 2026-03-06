import { Platform } from 'react-native';
import type { SwingAnalysisResult } from './types';

type NativeModule = {
  analyzeClip: (filePath: string, clipId: string) => Promise<SwingAnalysisResult>;
  cancelAnalysis: () => void;
};

/** SwingAnalysis is iOS-only. Returns null on other platforms. */
function loadModule(): NativeModule | null {
  if (Platform.OS !== 'ios') return null;
  // Dynamic require so Android never evaluates requireNativeModule
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const expoModules = require('expo-modules-core') as typeof import('expo-modules-core');
  return expoModules.requireNativeModule<NativeModule>('SwingAnalysis');
}

export const SwingAnalysisModule = loadModule();
