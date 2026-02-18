/**
 * Divot Settings Context
 *
 * Provides persistent app settings throughout the app.
 * Settings are stored in AsyncStorage and loaded on app start.
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================
// TYPES
// ============================================

export type ThemeMode = 'system' | 'light' | 'dark';

export type RecordingFps = 30 | 60 | 120 | 240;

export const RECORDING_FPS_VALUES: RecordingFps[] = [30, 60, 120, 240];

export type Settings = {
  /** Whether haptic feedback is enabled. Defaults to true. */
  hapticsEnabled: boolean;
  /** Theme mode override. Defaults to 'system'. */
  themeMode: ThemeMode;
  /** Recording fps target. Defaults to 30. */
  recordingFps: RecordingFps;
  /** Fps values the current device supports. Null until camera opens. */
  supportedRecordingFps: RecordingFps[] | null;
  /** Whether the pose skeleton overlay is shown on camera preview. Defaults to false. */
  poseOverlayEnabled: boolean;
  /** Whether swing auto-detection is enabled. Defaults to false. */
  swingAutoDetectionEnabled: boolean;
  /** Swing detection sensitivity, 0-1. Higher = more sensitive. Defaults to 0.5. */
  swingDetectionSensitivity: number;
  /** Whether the detection debug overlay is shown on camera preview. Defaults to false. */
  debugOverlayEnabled: boolean;
  /** Whether to use the trained swing classifier instead of motion detection. Defaults to false. */
  swingClassifierEnabled: boolean;
};

type SettingsContextValue = {
  settings: Settings;
  isLoaded: boolean;
  setHapticsEnabled: (enabled: boolean) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setRecordingFps: (fps: RecordingFps) => void;
  setSupportedRecordingFps: (fps: RecordingFps[]) => void;
  setPoseOverlayEnabled: (enabled: boolean) => void;
  setSwingAutoDetectionEnabled: (enabled: boolean) => void;
  setSwingDetectionSensitivity: (sensitivity: number) => void;
  setDebugOverlayEnabled: (enabled: boolean) => void;
  setSwingClassifierEnabled: (enabled: boolean) => void;
};

// ============================================
// CONSTANTS
// ============================================

const SETTINGS_KEY = '@divot/settings';

const DEFAULT_SETTINGS: Settings = {
  hapticsEnabled: true,
  themeMode: 'system',
  recordingFps: 30,
  supportedRecordingFps: null,
  poseOverlayEnabled: false,
  swingAutoDetectionEnabled: false,
  swingDetectionSensitivity: 0.5,
  debugOverlayEnabled: false,
  swingClassifierEnabled: false,
};

// ============================================
// CONTEXT
// ============================================

const SettingsContext = createContext<SettingsContextValue | null>(null);

// ============================================
// PROVIDER
// ============================================

type SettingsProviderProps = {
  children: ReactNode;
};

/**
 * Provides settings context to the app with AsyncStorage persistence.
 */
export const SettingsProvider = ({ children }: SettingsProviderProps) => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from storage on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const stored = await AsyncStorage.getItem(SETTINGS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<Settings>;
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setIsLoaded(true);
      }
    };
    loadSettings();
  }, []);

  // Persist settings whenever they change (exclude runtime-only fields)
  const persistSettings = useCallback(async (newSettings: Settings) => {
    try {
      const { supportedRecordingFps: _, ...persistable } = newSettings;
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(persistable));
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }, []);

  const setHapticsEnabled = useCallback(
    (enabled: boolean) => {
      setSettings((prev) => {
        const updated = { ...prev, hapticsEnabled: enabled };
        persistSettings(updated);
        return updated;
      });
    },
    [persistSettings]
  );

  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      setSettings((prev) => {
        const updated = { ...prev, themeMode: mode };
        persistSettings(updated);
        return updated;
      });
    },
    [persistSettings]
  );

  const setRecordingFps = useCallback(
    (fps: RecordingFps) => {
      setSettings((prev) => {
        const updated = { ...prev, recordingFps: fps };
        persistSettings(updated);
        return updated;
      });
    },
    [persistSettings]
  );

  /** Runtime-only — not persisted to AsyncStorage (hardware-dependent, re-detected each session). */
  const setSupportedRecordingFps = useCallback(
    (fps: RecordingFps[]) => {
      setSettings((prev) => ({ ...prev, supportedRecordingFps: fps }));
    },
    []
  );

  const setPoseOverlayEnabled = useCallback(
    (enabled: boolean) => {
      setSettings((prev) => {
        const updated = { ...prev, poseOverlayEnabled: enabled };
        persistSettings(updated);
        return updated;
      });
    },
    [persistSettings]
  );

  const setSwingAutoDetectionEnabled = useCallback(
    (enabled: boolean) => {
      setSettings((prev) => {
        const updated = { ...prev, swingAutoDetectionEnabled: enabled };
        persistSettings(updated);
        return updated;
      });
    },
    [persistSettings]
  );

  const setSwingDetectionSensitivity = useCallback(
    (sensitivity: number) => {
      setSettings((prev) => {
        const updated = { ...prev, swingDetectionSensitivity: sensitivity };
        persistSettings(updated);
        return updated;
      });
    },
    [persistSettings]
  );

  const setDebugOverlayEnabled = useCallback(
    (enabled: boolean) => {
      setSettings((prev) => {
        const updated = { ...prev, debugOverlayEnabled: enabled };
        persistSettings(updated);
        return updated;
      });
    },
    [persistSettings]
  );

  const setSwingClassifierEnabled = useCallback(
    (enabled: boolean) => {
      setSettings((prev) => {
        const updated = { ...prev, swingClassifierEnabled: enabled };
        persistSettings(updated);
        return updated;
      });
    },
    [persistSettings]
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      isLoaded,
      setHapticsEnabled,
      setThemeMode,
      setRecordingFps,
      setSupportedRecordingFps,
      setPoseOverlayEnabled,
      setSwingAutoDetectionEnabled,
      setSwingDetectionSensitivity,
      setDebugOverlayEnabled,
      setSwingClassifierEnabled,
    }),
    [settings, isLoaded, setHapticsEnabled, setThemeMode, setRecordingFps, setSupportedRecordingFps, setPoseOverlayEnabled, setSwingAutoDetectionEnabled, setSwingDetectionSensitivity, setDebugOverlayEnabled, setSwingClassifierEnabled]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

// ============================================
// HOOK
// ============================================

/**
 * Access app settings and settings controls.
 *
 * @returns Settings object and setter functions
 * @throws Error if used outside of SettingsProvider
 */
export const useSettings = (): SettingsContextValue => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
