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
import { PostHogProvider, usePostHog } from 'posthog-react-native';
import { ClerkProvider, ClerkLoaded, useUser } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import Constants from 'expo-constants';

import { AppThemeProvider, ToastProvider, SettingsProvider, useSettings, useTheme } from '@/src/context';
import { setPostHogInstance, identifyUser } from '@/src/services/analytics';
import type { ThemeMode } from '@/src/context';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

const posthogApiKey = Constants.expoConfig?.extra?.posthogApiKey as string | undefined;
const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Bridge that captures the PostHog instance for use outside React.
 */
const PostHogBridge = ({ children }: { children: ReactNode }) => {
  const posthog = usePostHog();

  useEffect(() => {
    if (posthog) setPostHogInstance(posthog);
  }, [posthog]);

  return <>{children}</>;
};

/**
 * Identifies the signed-in Clerk user in PostHog analytics.
 */
const AuthAnalyticsBridge = ({ children }: { children: ReactNode }) => {
  const { user } = useUser();

  useEffect(() => {
    if (user?.id) {
      identifyUser(user.id);
    }
  }, [user?.id]);

  return <>{children}</>;
};

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

  const screens = (
    <>
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
          headerBackTitle: 'Home',
        }}
      />
      <Stack.Screen
        name="clips"
        options={{
          title: 'Clips',
          headerBackTitle: 'Home',
        }}
      />
      <Stack.Screen
        name="playback/[id]"
        options={{
          title: 'Playback',
          headerBackTitle: 'Clips',
        }}
      />
      <Stack.Screen
        name="sessions"
        options={{
          title: 'Sessions',
          headerBackTitle: 'Home',
        }}
      />
      <Stack.Screen
        name="session/[id]"
        options={{
          title: 'Session',
          headerBackTitle: 'Sessions',
        }}
      />
      <Stack.Screen
        name="sign-in"
        options={{
          title: 'Account',
          presentation: 'modal',
          headerBackTitle: 'Back',
        }}
      />
    </>
  );

  const innerContent = (
    <SettingsProvider>
      <ThemedApp>
        <ToastProvider>
          <NavigationLayout>
            {screens}
          </NavigationLayout>
        </ToastProvider>
      </ThemedApp>
    </SettingsProvider>
  );

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {clerkPublishableKey ? (
        <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
          <ClerkLoaded>
            <AuthAnalyticsBridge>
              {innerContent}
            </AuthAnalyticsBridge>
          </ClerkLoaded>
        </ClerkProvider>
      ) : (
        innerContent
      )}
    </GestureHandlerRootView>
  );

  if (!posthogApiKey) return content;

  return (
    <PostHogProvider
      apiKey={posthogApiKey}
      options={{ host: 'https://us.i.posthog.com' }}
    >
      <PostHogBridge>
        {content}
      </PostHogBridge>
    </PostHogProvider>
  );
}
