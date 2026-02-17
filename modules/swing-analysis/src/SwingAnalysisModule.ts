import { requireNativeModule } from 'expo-modules-core';
import type { SwingAnalysisResult } from './types';

type NativeModule = {
  analyzeClip: (filePath: string, clipId: string) => Promise<SwingAnalysisResult>;
  cancelAnalysis: () => void;
};

export const SwingAnalysisModule =
  requireNativeModule<NativeModule>('SwingAnalysis');
