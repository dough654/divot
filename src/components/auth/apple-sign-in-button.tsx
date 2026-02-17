import { useCallback } from 'react';
import { Platform, Pressable, Text } from 'react-native';
import { useSignInWithApple } from '@clerk/clerk-expo';

import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import { useToast } from '@/src/context';
import type { Theme } from '@/src/context';

type AppleSignInButtonProps = {
  onSuccess?: () => void;
  mode?: 'sign-in' | 'sign-up';
};

/** Native Apple Sign-In button. Only renders on iOS. */
export const AppleSignInButton = ({ onSuccess, mode = 'sign-in' }: AppleSignInButtonProps) => {
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const styles = useThemedStyles(createStyles);
  const { show: showToast } = useToast();

  const handleAppleSignIn = useCallback(async () => {
    try {
      const { createdSessionId, setActive } = await startAppleAuthenticationFlow();

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        onSuccess?.();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Apple sign-in failed';
      showToast(message, { variant: 'error' });
    }
  }, [startAppleAuthenticationFlow, onSuccess, showToast]);

  if (Platform.OS !== 'ios') return null;

  return (
    <Pressable
      style={styles.button}
      onPress={handleAppleSignIn}
      accessibilityRole="button"
      accessibilityLabel={`${mode === 'sign-up' ? 'Sign up' : 'Sign in'} with Apple`}
    >
      <Text style={styles.appleIcon}>{'\uF8FF'}</Text>
      <Text style={styles.buttonText}>{mode === 'sign-up' ? 'Sign up' : 'Sign in'} with Apple</Text>
    </Pressable>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  button: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.isDark ? '#fff' : '#000',
    gap: theme.spacing.sm,
  },
  appleIcon: {
    fontSize: 18,
    color: theme.isDark ? '#000' : '#fff',
  },
  buttonText: {
    fontFamily: theme.fontFamily.bodyMedium,
    fontSize: 16,
    color: theme.isDark ? '#000' : '#fff',
  },
}));
