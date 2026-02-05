/**
 * SwingLink Settings Context
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

export type Settings = {
  /** Whether haptic feedback is enabled. Defaults to true. */
  hapticsEnabled: boolean;
  /** Theme mode override. Defaults to 'system'. */
  themeMode: ThemeMode;
};

type SettingsContextValue = {
  settings: Settings;
  isLoaded: boolean;
  setHapticsEnabled: (enabled: boolean) => void;
  setThemeMode: (mode: ThemeMode) => void;
};

// ============================================
// CONSTANTS
// ============================================

const SETTINGS_KEY = '@swinglink/settings';

const DEFAULT_SETTINGS: Settings = {
  hapticsEnabled: true,
  themeMode: 'system',
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

  // Persist settings whenever they change
  const persistSettings = useCallback(async (newSettings: Settings) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
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

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      isLoaded,
      setHapticsEnabled,
      setThemeMode,
    }),
    [settings, isLoaded, setHapticsEnabled, setThemeMode]
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
