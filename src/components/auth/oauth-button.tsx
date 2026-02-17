import { useCallback } from 'react';
import { Pressable, Text } from 'react-native';
import { useSSO } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';

import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import { useToast } from '@/src/context';
import type { Theme } from '@/src/context';

WebBrowser.maybeCompleteAuthSession();

type OAuthButtonProps = {
  onSuccess?: () => void;
  mode?: 'sign-in' | 'sign-up';
};

/** Google OAuth sign-in button using Clerk SSO. */
export const OAuthButton = ({ onSuccess, mode = 'sign-in' }: OAuthButtonProps) => {
  const { startSSOFlow } = useSSO();
  const styles = useThemedStyles(createStyles);
  const { show: showToast } = useToast();

  const handleGoogleSignIn = useCallback(async () => {
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: makeRedirectUri(),
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        onSuccess?.();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed';
      showToast(message, { variant: 'error' });
    }
  }, [startSSOFlow, onSuccess, showToast]);

  return (
    <Pressable
      style={styles.button}
      onPress={handleGoogleSignIn}
      accessibilityRole="button"
      accessibilityLabel={`${mode === 'sign-up' ? 'Sign up' : 'Sign in'} with Google`}
    >
      <Text style={styles.buttonText}>{mode === 'sign-up' ? 'Sign up' : 'Sign in'} with Google</Text>
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
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.sm,
  },
  buttonText: {
    fontFamily: theme.fontFamily.bodyMedium,
    fontSize: 16,
    color: theme.colors.text,
  },
}));
