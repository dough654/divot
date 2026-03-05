import { View, Text, Pressable, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';

import { useTheme } from '@/src/context';
import { useThemedStyles, makeThemedStyles, usePressAnimation } from '@/src/hooks';
import { formatRelativeDate, formatDuration, formatFileSize } from '@/src/utils/format';
import { getTempoRating } from '@/src/utils/swing-tempo';
import type { Theme } from '@/src/context';
import type { Clip } from '@/src/types/recording';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ClipItemProps = {
  clip: Clip;
  /** Display index (1-based numbering). */
  index: number;
  onPress: () => void;
  onMenuPress: () => void;
  /** Called when the user taps the cloud sync button. */
  onBackUp?: () => void;
};

/**
 * A single clip row used in both the clips list and session detail screens.
 */
export const ClipItem = ({ clip, index, onPress, onMenuPress, onBackUp }: ClipItemProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createItemStyles);

  const { animatedStyle, handlePressIn, handlePressOut } = usePressAnimation({
    defaultColor: 'transparent',
    pressedColor: theme.colors.accentDim,
  });

  const clipName = clip.name || `Swing ${formatRelativeDate(clip.timestamp)}`;
  const hasTempo = clip.tempoRatio != null;
  const tempoColor = hasTempo
    ? getTempoRating(clip.tempoRatio!) === 'ideal' ? theme.colors.success : theme.colors.warning
    : undefined;

  return (
    <AnimatedPressable
      style={[styles.container, animatedStyle]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      android_ripple={Platform.OS === 'android' ? { color: theme.colors.accentDim } : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${clipName}, ${formatDuration(clip.duration)}, ${formatFileSize(clip.fileSize)}`}
      accessibilityHint="Open clip for playback"
    >
      <Text style={styles.number}>{String(index + 1).padStart(2, '0')}</Text>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {clipName}
        </Text>
        <Text style={styles.meta}>
          {formatDuration(clip.duration)} · {formatFileSize(clip.fileSize)} · {clip.fps}fps{clip.cameraAngle ? ` · ${clip.cameraAngle === 'dtl' ? 'DTL' : 'FO'}` : ''}{hasTempo && <Text style={{ color: tempoColor }}> · {clip.tempoRatio!.toFixed(1)}:1</Text>}
        </Text>
      </View>
      {clip.syncStatus === 'synced' && (
        <Ionicons name="cloud-done-outline" size={18} color={theme.colors.success} />
      )}
      {(clip.syncStatus === 'uploading' || clip.syncStatus === 'pending') && (
        <ActivityIndicator size="small" color={theme.colors.textTertiary} />
      )}
      {clip.syncStatus !== 'synced' && clip.syncStatus !== 'uploading' && clip.syncStatus !== 'pending' && onBackUp && (
        <Pressable
          onPress={onBackUp}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back up clip to cloud"
        >
          <Ionicons name="cloud-upload-outline" size={18} color={theme.colors.textTertiary} />
        </Pressable>
      )}
      <Pressable
        style={styles.menuButton}
        onPress={onMenuPress}
        android_ripple={Platform.OS === 'android' ? { color: theme.colors.accentDim, borderless: true } : undefined}
        accessibilityRole="button"
        accessibilityLabel={`Options for ${clipName}`}
        accessibilityHint="Open menu to rename or delete clip"
      >
        <Ionicons name="ellipsis-vertical" size={18} color={theme.colors.textTertiary} />
      </Pressable>
    </AnimatedPressable>
  );
};

const createItemStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 12,
  },
  number: {
    fontFamily: theme.fontFamily.display,
    fontSize: 24,
    color: theme.colors.textTertiary,
    width: 32,
    textAlign: 'right' as const,
  },
  info: {
    flex: 1,
  },
  title: {
    fontFamily: theme.fontFamily.display,
    fontSize: 18,
    color: theme.colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  meta: {
    fontFamily: theme.fontFamily.body,
    fontSize: 15,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
  },
  menuButton: {
    padding: theme.spacing.sm,
  },
}));
