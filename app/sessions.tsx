import { View, Text, FlatList, Pressable, RefreshControl, Alert, Platform } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';

import { useTheme } from '@/src/context';
import { useThemedStyles, makeThemedStyles, usePressAnimation } from '@/src/hooks';
import { useScreenOrientation } from '@/src/hooks/use-screen-orientation';
import { EmptyState, SkeletonClipItem } from '@/src/components/ui';
import type { Theme } from '@/src/context';
import type { Session } from '@/src/types/session';
import { listSessions, deleteSession, updateSessionNotes } from '@/src/services/session/session-storage';
import { listUnsortedClips } from '@/src/services/recording/clip-storage';
import { formatRelativeDate, formatSessionDuration } from '@/src/utils/format';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type SessionItemProps = {
  session: Session;
  onPress: () => void;
  onMenuPress: () => void;
};

const SessionItem = ({ session, onPress, onMenuPress }: SessionItemProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createItemStyles);

  const { animatedStyle, handlePressIn, handlePressOut } = usePressAnimation({
    defaultColor: 'transparent',
    pressedColor: theme.colors.accentDim,
  });

  const clipCount = session.clipIds.length;
  const duration = formatSessionDuration(session.startedAt, session.endedAt);

  return (
    <AnimatedPressable
      style={[styles.container, animatedStyle]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      android_ripple={Platform.OS === 'android' ? { color: theme.colors.accentDim } : undefined}
      accessibilityRole="button"
      accessibilityLabel={`Session from ${formatRelativeDate(session.startedAt)}, ${clipCount} clips, ${duration}`}
      accessibilityHint="View session details"
    >
      <View style={styles.iconContainer}>
        <Ionicons name="golf-outline" size={22} color={theme.colors.textTertiary} />
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {formatRelativeDate(session.startedAt)}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>
            {clipCount} clip{clipCount !== 1 ? 's' : ''} · {duration}
          </Text>
          {session.location?.displayName && (
            <View style={styles.locationBadge}>
              <Ionicons name="location-outline" size={12} color={theme.colors.textTertiary} />
              <Text style={styles.locationText} numberOfLines={1}>
                {session.location.displayName}
              </Text>
            </View>
          )}
        </View>
      </View>
      <Pressable
        style={styles.menuButton}
        onPress={onMenuPress}
        android_ripple={Platform.OS === 'android' ? { color: theme.colors.accentDim, borderless: true } : undefined}
        accessibilityRole="button"
        accessibilityLabel="Session options"
        accessibilityHint="Open menu to delete or add notes"
      >
        <Ionicons name="ellipsis-vertical" size={18} color={theme.colors.textTertiary} />
      </Pressable>
    </AnimatedPressable>
  );
};

export default function SessionsScreen() {
  useScreenOrientation({ lock: 'portrait' });
  const { theme } = useTheme();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [unsortedCount, setUnsortedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [allSessions, unsortedClips] = await Promise.all([
        listSessions(),
        listUnsortedClips(),
      ]);
      setSessions(allSessions);
      setUnsortedCount(unsortedClips.length);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadData();
  }, [loadData]);

  const handleSessionPress = useCallback((session: Session) => {
    router.push(`/session/${session.id}`);
  }, [router]);

  const handleSessionMenu = useCallback((session: Session) => {
    Alert.alert(
      formatRelativeDate(session.startedAt),
      'What would you like to do?',
      [
        {
          text: 'Add Notes',
          onPress: () => {
            Alert.prompt(
              'Session Notes',
              'Add notes about this practice session',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Save',
                  onPress: async (text?: string) => {
                    if (text?.trim()) {
                      await updateSessionNotes(session.id, text.trim());
                      loadData();
                    }
                  },
                },
              ],
              'plain-text',
              session.notes ?? '',
            );
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => handleDeleteSession(session),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
    );
  }, [loadData]);

  const handleDeleteSession = useCallback((session: Session) => {
    Alert.alert(
      'Delete Session',
      'Delete this session? Clips will not be deleted — they will become unsorted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteSession(session.id);
            loadData();
          },
        },
      ],
    );
  }, [loadData]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.listContent}>
          <SkeletonClipItem />
          <View style={styles.separator} />
          <SkeletonClipItem />
          <View style={styles.separator} />
          <SkeletonClipItem />
        </View>
      </View>
    );
  }

  if (sessions.length === 0 && unsortedCount === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="calendar-outline"
          title="No Sessions Yet"
          description="Sessions are created automatically when your camera connects to a viewer."
          action={{
            label: 'Go to Camera',
            onPress: () => router.push('/camera'),
            icon: 'videocam',
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SessionItem
            session={item}
            onPress={() => handleSessionPress(item)}
            onMenuPress={() => handleSessionMenu(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerCount}>
              {sessions.length} session{sessions.length !== 1 ? 's' : ''}
            </Text>
          </View>
        }
        ListFooterComponent={unsortedCount > 0 ? (
          <Pressable
            style={styles.unsortedRow}
            onPress={() => router.push('/clips')}
            accessibilityRole="button"
            accessibilityLabel={`${unsortedCount} unsorted clips`}
            accessibilityHint="View clips not in any session"
          >
            <Ionicons name="film-outline" size={18} color={theme.colors.textTertiary} />
            <Text style={styles.unsortedText}>
              {unsortedCount} unsorted clip{unsortedCount !== 1 ? 's' : ''}
            </Text>
            <Text style={styles.unsortedArrow}>→</Text>
          </Pressable>
        ) : null}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.text}
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: 4,
    marginBottom: theme.spacing.sm,
  },
  headerCount: {
    fontFamily: theme.fontFamily.body,
    fontSize: 15,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
    marginTop: 2,
  },
  listContent: {
    padding: theme.spacing.lg,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginLeft: 48,
  },
  unsortedRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  unsortedText: {
    flex: 1,
    fontFamily: theme.fontFamily.body,
    fontSize: 15,
    color: theme.colors.textTertiary,
  },
  unsortedArrow: {
    fontFamily: theme.fontFamily.body,
    fontSize: 16,
    color: theme.colors.textTertiary,
  },
}));

const createItemStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 12,
  },
  iconContainer: {
    width: 32,
    alignItems: 'center' as const,
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
  metaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  meta: {
    fontFamily: theme.fontFamily.body,
    fontSize: 15,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
  },
  locationBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 2,
  },
  locationText: {
    fontFamily: theme.fontFamily.body,
    fontSize: 13,
    color: theme.colors.textTertiary,
    maxWidth: 120,
  },
  menuButton: {
    padding: theme.spacing.sm,
  },
}));
