import { requireNativeModule } from 'expo-modules-core';
import type { VideoPoseAnalysisResult } from './types';

type NativeModule = {
  analyzeVideo: (filePath: string, clipId: string) => Promise<VideoPoseAnalysisResult>;
  cancelAnalysis: () => void;
};

export const VideoPoseAnalysisModule =
  requireNativeModule<NativeModule>('VideoPoseAnalysis');
