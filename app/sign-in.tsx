import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSignIn, useSignUp } from '@clerk/clerk-expo';

import { useTheme, useToast } from '@/src/context';
import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import { useScreenOrientation } from '@/src/hooks/use-screen-orientation';
import { useWarmUpBrowser } from '@/src/hooks/use-warm-up-browser';
import { OAuthButton, AppleSignInButton } from '@/src/components/auth';
import { isValidEmail, isValidPassword, getPasswordError } from '@/src/utils/auth-validation';
import type { Theme } from '@/src/context';

type AuthMode = 'sign-in' | 'sign-up';

export default function SignInScreen() {
  useScreenOrientation({ lock: 'portrait' });
  useWarmUpBrowser();

  const router = useRouter();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { show: showToast } = useToast();

  const { signIn, setActive: setSignInActive, isLoaded: isSignInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: isSignUpLoaded } = useSignUp();

  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSuccess = useCallback(() => {
    router.back();
  }, [router]);

  const handleSignIn = useCallback(async () => {
    if (!isSignInLoaded || !signIn) return;
    if (!isValidEmail(email)) {
      showToast('Please enter a valid email', { variant: 'error' });
      return;
    }
    const passwordError = getPasswordError(password);
    if (passwordError) {
      showToast(passwordError, { variant: 'error' });
      return;
    }

    setLoading(true);
    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });

      if (result.status === 'complete' && setSignInActive) {
        await setSignInActive({ session: result.createdSessionId });
        handleSuccess();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed';
      showToast(message, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [isSignInLoaded, signIn, email, password, setSignInActive, handleSuccess, showToast]);

  const handleSignUp = useCallback(async () => {
    if (!isSignUpLoaded || !signUp) return;
    if (!isValidEmail(email)) {
      showToast('Please enter a valid email', { variant: 'error' });
      return;
    }
    if (!isValidPassword(password)) {
      showToast(getPasswordError(password) ?? 'Invalid password', { variant: 'error' });
      return;
    }
    if (password !== confirmPassword) {
      showToast('Passwords do not match', { variant: 'error' });
      return;
    }

    setLoading(true);
    try {
      await signUp.create({
        emailAddress: email.trim(),
        password,
      });

      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-up failed';
      showToast(message, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [isSignUpLoaded, signUp, email, password, showToast]);

  const handleVerification = useCallback(async () => {
    if (!isSignUpLoaded || !signUp) return;

    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: verificationCode,
      });

      if (result.status === 'complete' && setSignUpActive) {
        await setSignUpActive({ session: result.createdSessionId });
        handleSuccess();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      showToast(message, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [isSignUpLoaded, signUp, verificationCode, setSignUpActive, handleSuccess, showToast]);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === 'sign-in' ? 'sign-up' : 'sign-in'));
    setPendingVerification(false);
    setVerificationCode('');
    setConfirmPassword('');
  }, []);

  if (pendingVerification) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Verify Email</Text>
          <Text style={styles.subtitle}>
            We sent a code to {email}
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Verification code"
            placeholderTextColor={theme.colors.textTertiary}
            value={verificationCode}
            onChangeText={setVerificationCode}
            keyboardType="number-pad"
            autoFocus
          />

          <Pressable
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleVerification}
            disabled={loading || verificationCode.length === 0}
          >
            {loading ? (
              <ActivityIndicator color={theme.isDark ? theme.palette.black : theme.palette.white} />
            ) : (
              <Text style={styles.submitButtonText}>Verify</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <Text style={styles.title}>
            {mode === 'sign-in' ? 'Welcome Back' : 'Create Account'}
          </Text>

          {/* Mode toggle */}
          <View style={styles.modeToggle}>
            <Pressable
              style={[styles.modeButton, mode === 'sign-in' && styles.modeButtonActive]}
              onPress={() => setMode('sign-in')}
            >
              <Text style={[styles.modeButtonText, mode === 'sign-in' && styles.modeButtonTextActive]}>
                Sign In
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeButton, mode === 'sign-up' && styles.modeButtonActive]}
              onPress={() => setMode('sign-up')}
            >
              <Text style={[styles.modeButtonText, mode === 'sign-up' && styles.modeButtonTextActive]}>
                Sign Up
              </Text>
            </Pressable>
          </View>

          {/* Social sign-in buttons */}
          <View style={styles.socialSection}>
            <OAuthButton onSuccess={handleSuccess} mode={mode} />
            <AppleSignInButton onSuccess={handleSuccess} mode={mode} />
          </View>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email / Password form */}
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={theme.colors.textTertiary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={theme.colors.textTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType={mode === 'sign-up' ? 'newPassword' : 'password'}
          />

          {mode === 'sign-up' && (
            <TextInput
              style={styles.input}
              placeholder="Confirm password"
              placeholderTextColor={theme.colors.textTertiary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              textContentType="newPassword"
            />
          )}

          <Pressable
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={mode === 'sign-in' ? handleSignIn : handleSignUp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={theme.isDark ? theme.palette.black : theme.palette.white} />
            ) : (
              <Text style={styles.submitButtonText}>
                {mode === 'sign-in' ? 'Sign In' : 'Sign Up'}
              </Text>
            )}
          </Pressable>

          {/* Toggle mode link */}
          <Pressable onPress={toggleMode} style={styles.toggleLink}>
            <Text style={styles.toggleText}>
              {mode === 'sign-in'
                ? "Don't have an account? Sign Up"
                : 'Already have an account? Sign In'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center' as const,
  },
  content: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  title: {
    fontFamily: theme.fontFamily.display,
    fontSize: 28,
    color: theme.colors.text,
    textAlign: 'center' as const,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontFamily: theme.fontFamily.body,
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing.md,
  },
  modeToggle: {
    flexDirection: 'row' as const,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden' as const,
    marginBottom: theme.spacing.sm,
  },
  modeButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center' as const,
  },
  modeButtonActive: {
    backgroundColor: theme.colors.accent,
  },
  modeButtonText: {
    fontFamily: theme.fontFamily.bodyMedium,
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
  modeButtonTextActive: {
    color: theme.isDark ? theme.palette.black : theme.palette.white,
  },
  socialSection: {
    gap: theme.spacing.sm,
  },
  dividerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  dividerText: {
    fontFamily: theme.fontFamily.body,
    fontSize: 14,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
  },
  input: {
    fontFamily: theme.fontFamily.body,
    fontSize: 16,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.md,
  },
  submitButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 48,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontFamily: theme.fontFamily.bodyMedium,
    fontSize: 16,
    color: theme.isDark ? theme.palette.black : theme.palette.white,
  },
  toggleLink: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing.sm,
  },
  toggleText: {
    fontFamily: theme.fontFamily.body,
    fontSize: 14,
    color: theme.colors.accent,
  },
}));
