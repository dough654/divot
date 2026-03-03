/**
 * Compare screen — Side-by-side swing comparison.
 *
 * Two video slots, each with its own jog-wheel scrubber. When sync points
 * are set on both clips, scrubbing either jog-wheel moves both videos
 * with the correct offset. Shared controls for play both, step, speed.
 */
import { View } from 'react-native';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import { useScreenOrientation } from '@/src/hooks/use-screen-orientation';
import { useProAccess } from '@/src/hooks/use-pro-access';
import { useComparePlayback } from '@/src/hooks/use-compare-playback';
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

export default function CompareScreen() {
  const { isLandscape } = useScreenOrientation();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { isPro } = useProAccess();
  const { clipId } = useLocalSearchParams<{ clipId?: string }>();

  const [leftClip, setLeftClip] = useState<Clip | null>(null);
  const [rightClip, setRightClip] = useState<Clip | null>(null);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<'left' | 'right'>('left');
  const [portraitSplit, setPortraitSplit] = useState(false);

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

  return (
    <View style={[styles.container, containerPadding]}>
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
          isSplit={portraitSplit}
          showLayoutToggle={!isLandscape}
          onTogglePlay={playback.togglePlayBoth}
          onStepBackward={() => playback.stepBoth('backward')}
          onStepForward={() => playback.stepBoth('forward')}
          onCycleSpeed={playback.cycleSpeed}
          onClearSync={playback.clearSync}
          onToggleLayout={() => setPortraitSplit((prev) => !prev)}
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
}));
