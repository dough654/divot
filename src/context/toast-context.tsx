/**
 * SwingLink Toast Context
 *
 * Provides a unified toast notification system throughout the app.
 * Supports success, error, warning, and info variants with auto-dismiss.
 *
 * @example
 * // In your component
 * const { show } = useToast();
 *
 * // Show a success toast
 * show('Recording saved!', { variant: 'success' });
 *
 * // Show an error with custom duration
 * show('Failed to connect', { variant: 'error', duration: 5000 });
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTheme } from './theme-context';
import { useThemedStyles, makeThemedStyles } from '../hooks/use-themed-styles';
import { useHaptics } from '../hooks/use-haptics';
import type { Theme } from './theme-context';

// ============================================
// TYPES
// ============================================

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export type ToastOptions = {
  /** Toast variant determines color and icon. Defaults to 'info'. */
  variant?: ToastVariant;
  /** Duration in ms before auto-dismiss. Defaults to 3000. Set to 0 to disable. */
  duration?: number;
  /** Accessibility label for screen readers. Defaults to message. */
  accessibilityLabel?: string;
};

type Toast = {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
  accessibilityLabel: string;
};

type ToastContextValue = {
  /** Show a toast notification. Returns toast ID for manual dismissal. */
  show: (message: string, options?: ToastOptions) => string;
  /** Manually dismiss a toast by ID. */
  dismiss: (id: string) => void;
  /** Dismiss all toasts. */
  dismissAll: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_DURATION = 3000;
const TOAST_HEIGHT = 60;
const TOAST_MARGIN = 8;

const VARIANT_ICONS: Record<ToastVariant, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  error: 'close-circle',
  warning: 'warning',
  info: 'information-circle',
};

// ============================================
// TOAST ITEM COMPONENT
// ============================================

type ToastItemProps = {
  toast: Toast;
  index: number;
  onDismiss: (id: string) => void;
};

const ToastItem = ({ toast, index, onDismiss }: ToastItemProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createToastStyles);
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Animation values
  const translateY = useSharedValue(-100);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const dismissedRef = useRef(false);

  // Get variant-specific styling
  const variantColors = useMemo(() => {
    switch (toast.variant) {
      case 'success':
        return { bg: theme.colors.successBackground, icon: theme.colors.success };
      case 'error':
        return { bg: theme.colors.errorBackground, icon: theme.colors.error };
      case 'warning':
        return { bg: theme.colors.warningBackground, icon: theme.colors.warning };
      case 'info':
      default:
        return { bg: theme.colors.infoBackground, icon: theme.colors.info };
    }
  }, [toast.variant, theme]);

  // Dismiss handler
  const handleDismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    onDismiss(toast.id);
  }, [toast.id, onDismiss]);

  // Animate in on mount
  useMemo(() => {
    translateY.value = withTiming(index * (TOAST_HEIGHT + TOAST_MARGIN), {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
    opacity.value = withTiming(1, { duration: 150 });
  }, [index, translateY, opacity]);

  // Auto-dismiss timer
  useMemo(() => {
    if (toast.duration > 0) {
      const timeout = setTimeout(() => {
        opacity.value = withTiming(0, { duration: 200 }, () => {
          runOnJS(handleDismiss)();
        });
      }, toast.duration);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [toast.duration, opacity, handleDismiss]);

  // Swipe gesture
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      if (Math.abs(event.translationX) > screenWidth * 0.3) {
        // Swipe threshold reached - dismiss
        const direction = event.translationX > 0 ? 1 : -1;
        translateX.value = withTiming(
          direction * screenWidth,
          { duration: 200, easing: Easing.out(Easing.ease) },
          () => {
            runOnJS(handleDismiss)();
          }
        );
      } else {
        // Snap back
        translateX.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.cubic) });
      }
    });

  // Animated styles
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.toast,
          { top: insets.top + TOAST_MARGIN, backgroundColor: variantColors.bg },
          animatedStyle,
        ]}
        accessibilityRole="alert"
        accessibilityLabel={toast.accessibilityLabel}
        accessibilityLiveRegion="polite"
      >
        <Ionicons
          name={VARIANT_ICONS[toast.variant]}
          size={24}
          color={variantColors.icon}
          style={styles.icon}
        />
        <Text style={styles.message} numberOfLines={2}>
          {toast.message}
        </Text>
        <Pressable
          onPress={handleDismiss}
          style={styles.dismissButton}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notification"
          hitSlop={8}
        >
          <Ionicons
            name="close"
            size={20}
            color={theme.colors.textSecondary}
          />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
};

// ============================================
// PROVIDER
// ============================================

type ToastProviderProps = {
  children: ReactNode;
};

/**
 * Provides toast notification capabilities to the app.
 * Must be wrapped inside GestureHandlerRootView and SafeAreaProvider.
 */
export const ToastProvider = ({ children }: ToastProviderProps) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idCounter = useRef(0);
  const haptics = useHaptics();

  const show = useCallback((message: string, options?: ToastOptions): string => {
    const id = `toast-${++idCounter.current}`;
    const variant = options?.variant ?? 'info';
    const toast: Toast = {
      id,
      message,
      variant,
      duration: options?.duration ?? DEFAULT_DURATION,
      accessibilityLabel: options?.accessibilityLabel ?? message,
    };

    // Haptic feedback based on variant
    switch (variant) {
      case 'success':
        haptics.success();
        break;
      case 'error':
        haptics.error();
        break;
      case 'warning':
        haptics.warning();
        break;
      // info: no haptic (too frequent/intrusive)
    }

    setToasts((prev) => [...prev, toast]);
    return id;
  }, [haptics]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ show, dismiss, dismissAll }),
    [show, dismiss, dismissAll]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View style={toastContainerStyle} pointerEvents="box-none">
        {toasts.map((toast, index) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            index={index}
            onDismiss={dismiss}
          />
        ))}
      </View>
    </ToastContext.Provider>
  );
};

// Container needs to be positioned absolutely to overlay content
const toastContainerStyle = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  zIndex: 9999,
  pointerEvents: 'box-none' as const,
};

// ============================================
// HOOK
// ============================================

/**
 * Access the toast notification system.
 *
 * @returns Methods to show, dismiss, and manage toasts
 * @throws Error if used outside of ToastProvider
 *
 * @example
 * const { show, dismiss } = useToast();
 *
 * // Show success toast
 * show('Changes saved!', { variant: 'success' });
 *
 * // Show error toast with longer duration
 * show('Connection failed', { variant: 'error', duration: 5000 });
 *
 * // Show and later dismiss programmatically
 * const id = show('Processing...', { variant: 'info', duration: 0 });
 * // ... later
 * dismiss(id);
 */
export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// ============================================
// STYLES
// ============================================

const createToastStyles = makeThemedStyles((theme: Theme) => ({
  toast: {
    position: 'absolute' as const,
    left: theme.spacing.md,
    right: theme.spacing.md,
    minHeight: TOAST_HEIGHT,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    ...theme.shadows.md,
  },
  icon: {
    marginRight: theme.spacing.md,
  },
  message: {
    flex: 1,
    fontFamily: theme.fontFamily.bodyMedium,
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
  },
  dismissButton: {
    marginLeft: theme.spacing.sm,
    padding: theme.spacing.xs,
  },
}));
