import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useColorScheme } from '@/components/useColorScheme';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const colorScheme = useColorScheme();

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
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: colorScheme === 'dark' ? '#1a1a2e' : '#ffffff',
            },
            headerTintColor: colorScheme === 'dark' ? '#ffffff' : '#1a1a2e',
            headerTitleStyle: {
              fontWeight: '600',
            },
          }}
        >
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
              title: 'Camera Mode',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="viewer"
            options={{
              title: 'Viewer Mode',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="settings"
            options={{
              title: 'Settings',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="clips"
            options={{
              title: 'My Clips',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="playback/[id]"
            options={{
              title: 'Playback',
              headerBackTitle: 'Clips',
            }}
          />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
