import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import {
  DarkerGrotesque_800ExtraBold,
  DarkerGrotesque_900Black,
} from '@expo-google-fonts/darker-grotesque';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, ReactNode } from 'react';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppThemeProvider, ToastProvider, SettingsProvider, useSettings, useTheme } from '@/src/context';
import type { ThemeMode } from '@/src/context';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

/**
 * Bridge component that connects SettingsProvider to AppThemeProvider.
 * Reads theme mode from settings and passes to theme provider.
 */
const ThemedApp = ({ children }: { children: ReactNode }) => {
  const { settings, setThemeMode } = useSettings();

  return (
    <AppThemeProvider
      themeMode={settings.themeMode}
      onThemeModeChange={(mode) => setThemeMode(mode as ThemeMode)}
    >
      {children}
    </AppThemeProvider>
  );
};

/**
 * Inner layout that has access to theme context for navigation styling.
 */
const NavigationLayout = ({ children }: { children: ReactNode }) => {
  const { theme, isDark } = useTheme();

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.text,
          headerTitleStyle: {
            fontFamily: 'Manrope_600SemiBold',
          },
          headerShadowVisible: false,
        }}
      >
        {children}
      </Stack>
    </ThemeProvider>
  );
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    DarkerGrotesque_800ExtraBold,
    DarkerGrotesque_900Black,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SettingsProvider>
        <ThemedApp>
          <ToastProvider>
            <NavigationLayout>
              <Stack.Screen
                name="index"
                options={{
                  title: 'SwingLink',
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="camera"
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="viewer"
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="settings"
                options={{
                  title: 'Settings',
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="clips"
                options={{
                  title: 'Clips',
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="playback/[id]"
                options={{
                  title: 'Playback',
                  headerBackTitle: 'Clips',
                }}
              />
            </NavigationLayout>
          </ToastProvider>
        </ThemedApp>
      </SettingsProvider>
    </GestureHandlerRootView>
  );
}
