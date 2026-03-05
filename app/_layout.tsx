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
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, ReactNode } from 'react';
import 'react-native-reanimated';
import { Pressable } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { PostHogProvider, usePostHog } from 'posthog-react-native';
import { ClerkProvider, ClerkLoaded, useUser, useAuth } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import Constants from 'expo-constants';

import { AppThemeProvider, ToastProvider, SettingsProvider, SubscriptionProvider, useSettings, useTheme, useSubscription } from '@/src/context';
import { setPostHogInstance, identifyUser } from '@/src/services/analytics';
import { setTokenGetter, setProChecker, setBackupEnabledChecker } from '@/src/services/cloud/upload-queue';
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
 * Passes the Clerk user ID to SubscriptionProvider for cross-device purchase persistence.
 */
const SubscriptionBridge = ({ children }: { children: ReactNode }) => {
  const { user } = useUser();
  return (
    <SubscriptionProvider userId={user?.id ?? null}>
      {children}
    </SubscriptionProvider>
  );
};

/**
 * Wires the upload queue with Clerk auth, subscription, and settings state.
 * Only rendered when Clerk is configured (clerkPublishableKey is set).
 */
const CloudSyncBridge = ({ children }: { children: ReactNode }) => {
  const { getToken } = useAuth();
  const { isPro } = useSubscription();
  const { settings } = useSettings();

  // Store getToken in a ref so the queue always calls the latest version,
  // even if Clerk internally invalidates earlier function references.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    setTokenGetter(() => getTokenRef.current());
  }, []);

  useEffect(() => {
    setProChecker(() => isPro);
  }, [isPro]);

  useEffect(() => {
    setBackupEnabledChecker(() => settings.cloudBackupEnabled);
  }, [settings.cloudBackupEnabled]);

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

/** Per-screen header config. Screens not listed here get headerShown: false. */
const screenHeaderConfig: Record<string, { title: string; headerBackTitle?: string; presentation?: 'modal' }> = {
  settings: { title: 'Settings', headerBackTitle: 'Home' },
  clips: { title: 'Clips', headerBackTitle: 'Home' },
  sessions: { title: 'Sessions', headerBackTitle: 'Home' },
  'session/[id]': { title: 'Session', headerBackTitle: 'Sessions' },
  compare: { title: 'Compare', headerBackTitle: 'Clips' },
  'sign-in': { title: 'Account', headerBackTitle: 'Back', presentation: 'modal' },
  paywall: { title: 'Divot Pro', headerBackTitle: 'Back', presentation: 'modal' },
};

/**
 * Inner layout that has access to theme context for navigation styling.
 */
const NavigationLayout = () => {
  const { theme, isDark } = useTheme();
  const router = useRouter();

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={({ route }) => {
          const config = screenHeaderConfig[route.name];
          const isModal = config?.presentation === 'modal';
          return {
            headerStyle: {
              backgroundColor: theme.colors.background,
            },
            headerTintColor: theme.colors.text,
            headerTitleStyle: {
              fontFamily: 'Manrope_600SemiBold',
            },
            headerShadowVisible: false,
            headerShown: !!config,
            ...(config ?? {}),
            ...(isModal
              ? {
                  headerLeft: () => (
                    <Pressable
                      onPress={() => router.back()}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                    >
                      <Ionicons name="close" size={24} color={theme.colors.text} />
                    </Pressable>
                  ),
                }
              : {}),
          };
        }}
      />
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

  const coreContent = (
    <ThemedApp>
      <ToastProvider>
        <NavigationLayout />
      </ToastProvider>
    </ThemedApp>
  );

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {clerkPublishableKey ? (
        <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
          <ClerkLoaded>
            <AuthAnalyticsBridge>
              <SubscriptionBridge>
                <SettingsProvider>
                  <CloudSyncBridge>
                    {coreContent}
                  </CloudSyncBridge>
                </SettingsProvider>
              </SubscriptionBridge>
            </AuthAnalyticsBridge>
          </ClerkLoaded>
        </ClerkProvider>
      ) : (
        <SubscriptionProvider userId={null}>
          <SettingsProvider>
            {coreContent}
          </SettingsProvider>
        </SubscriptionProvider>
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
