/**
 * Compare screen — Side-by-side swing comparison.
 *
 * Two video slots, each with its own jog-wheel scrubber. When sync points
 * are set on both clips, scrubbing either jog-wheel moves both videos
 * with the correct offset. Shared controls for play both, step, speed.
 */
import { View, Pressable } from 'react-native';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemedStyles, makeThemedStyles, useHaptics } from '@/src/hooks';
import { useScreenOrientation } from '@/src/hooks/use-screen-orientation';
import { useProAccess } from '@/src/hooks/use-pro-access';
import { useComparePlayback } from '@/src/hooks/use-compare-playback';
import { useTheme } from '@/src/context';
import { ProGate } from '@/src/components/pro-gate';
import {
  CompareVideoPanel,
  CompareControls,
  ClipPickerModal,
} from '@/src/components/compare';
import type { CompareVideoPanelHandle } from '@/src/components/compare';
import { getClip } from '@/src/services/recording/clip-storage';
import type { Theme } from '@/src/context';
import type { Clip } from '@/src/types/recording';

/** Miniature layout icon — two rectangles arranged to represent the layout. */
const LayoutIcon = ({ variant, color }: { variant: 'stack' | 'split'; color: string }) => {
  if (variant === 'stack') {
    return (
      <View style={{ alignItems: 'center', gap: 2 }}>
        <View style={{ width: 16, height: 6, borderRadius: 1, borderWidth: 1, borderColor: color }} />
        <View style={{ width: 16, height: 6, borderRadius: 1, borderWidth: 1, borderColor: color }} />
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <View style={{ width: 7, height: 13, borderRadius: 1, borderWidth: 1, borderColor: color }} />
      <View style={{ width: 7, height: 13, borderRadius: 1, borderWidth: 1, borderColor: color }} />
    </View>
  );
};

export default function CompareScreen() {
  const { isLandscape } = useScreenOrientation();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { isPro } = useProAccess();
  const { theme } = useTheme();
  const haptics = useHaptics();
  const { clipId } = useLocalSearchParams<{ clipId?: string }>();

  const [leftClip, setLeftClip] = useState<Clip | null>(null);
  const [rightClip, setRightClip] = useState<Clip | null>(null);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<'left' | 'right'>('left');
  const [portraitSplit, setPortraitSplit] = useState(false);

  const activeIconColor = theme.isDark ? theme.palette.black : theme.palette.white;
  const inactiveIconColor = theme.colors.textTertiary;

  const leftRef = useRef<CompareVideoPanelHandle | null>(null);
  const rightRef = useRef<CompareVideoPanelHandle | null>(null);

  const playback = useComparePlayback(leftRef, rightRef);

  // Pre-load slot A from navigation param
  useEffect(() => {
    if (!clipId) return;
    const loadInitialClip = async () => {
      const clip = await getClip(clipId);
      if (clip) setLeftClip(clip);
    };
    loadInitialClip();
  }, [clipId]);

  const openPicker = useCallback((slot: 'left' | 'right') => {
    setPickerSlot(slot);
    setPickerVisible(true);
  }, []);

  const handleClipSelected = useCallback((clip: Clip) => {
    if (pickerSlot === 'left') {
      setLeftClip(clip);
      playback.resetSlot('left');
    } else {
      setRightClip(clip);
      playback.resetSlot('right');
    }
  }, [pickerSlot, playback]);

  // Sync seek handlers — when one panel scrubs, seek the other with offset
  const handleLeftSyncSeek = useCallback((positionMs: number) => {
    playback.seekOther('left', positionMs);
  }, [playback]);

  const handleRightSyncSeek = useCallback((positionMs: number) => {
    playback.seekOther('right', positionMs);
  }, [playback]);

  // In portrait, the stack header already handles top safe area.
  // In landscape, we need horizontal safe area only.
  const containerPadding = isLandscape
    ? { paddingLeft: insets.left, paddingRight: insets.right }
    : { paddingBottom: insets.bottom };

  const headerRight = isLandscape ? undefined : () => (
    <View style={styles.layoutToggle}>
      <Pressable
        style={[styles.layoutSegment, !portraitSplit && styles.layoutSegmentActive]}
        onPress={() => {
          if (portraitSplit) {
            haptics.light();
            setPortraitSplit(false);
          }
        }}
        accessibilityRole="button"
        accessibilityLabel="Stacked layout"
      >
        <LayoutIcon variant="stack" color={!portraitSplit ? activeIconColor : inactiveIconColor} />
      </Pressable>
      <Pressable
        style={[styles.layoutSegment, portraitSplit && styles.layoutSegmentActive]}
        onPress={() => {
          if (!portraitSplit) {
            haptics.light();
            setPortraitSplit(true);
          }
        }}
        accessibilityRole="button"
        accessibilityLabel="Side-by-side layout"
      >
        <LayoutIcon variant="split" color={portraitSplit ? activeIconColor : inactiveIconColor} />
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.container, containerPadding]}>
      <Stack.Screen options={{ headerRight }} />
      <ProGate
        isPro={isPro}
        featureName="Swing Compare"
        featureDescription="Compare two swings side-by-side with synchronized scrubbing"
      >
        <View style={[
          styles.videoPanels,
          { flexDirection: (isLandscape || portraitSplit) ? 'row' as const : 'column' as const },
        ]}>
          <CompareVideoPanel
            ref={leftRef}
            uri={leftClip?.path ?? null}
            slotLabel="A"
            syncPointMs={playback.syncState.leftSyncPointMs}
            onSetSyncPoint={playback.setLeftSyncPoint}
            onPickClip={() => openPicker('left')}
            onSyncSeek={handleLeftSyncSeek}
          />
          <CompareVideoPanel
            ref={rightRef}
            uri={rightClip?.path ?? null}
            slotLabel="B"
            syncPointMs={playback.syncState.rightSyncPointMs}
            onSetSyncPoint={playback.setRightSyncPoint}
            onPickClip={() => openPicker('right')}
            onSyncSeek={handleRightSyncSeek}
          />
        </View>

        <CompareControls
          isPlaying={playback.isPlaying}
          playbackRate={playback.playbackRate}
          isSynced={playback.isSynced}
          onTogglePlay={playback.togglePlayBoth}
          onStepBackward={() => playback.stepBoth('backward')}
          onStepForward={() => playback.stepBoth('forward')}
          onCycleSpeed={playback.cycleSpeed}
          onClearSync={playback.clearSync}
        />
      </ProGate>

      <ClipPickerModal
        visible={pickerVisible}
        slotLabel={pickerSlot === 'left' ? 'A' : 'B'}
        onSelect={handleClipSelected}
        onClose={() => setPickerVisible(false)}
      />
    </View>
  );
}

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  videoPanels: {
    flex: 1,
    gap: 2,
  },
  layoutToggle: {
    flexDirection: 'row' as const,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden' as const,
  },
  layoutSegment: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  layoutSegmentActive: {
    backgroundColor: theme.colors.accent,
  },
}));
