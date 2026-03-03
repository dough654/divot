/**
 * Compare screen — Side-by-side swing comparison.
 *
 * Two video slots with a shared jog-wheel scrubber, sync point alignment,
 * and coordinated playback controls. Pro-gated feature.
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

  // Jog-wheel state — driven by left panel's playback updates
  const [scrubPosition, setScrubPosition] = useState(0);
  const [scrubDuration, setScrubDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

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

  // Left panel drives the jog-wheel position/duration
  const handleLeftPlaybackUpdate = useCallback((update: { position: number; duration: number }) => {
    setScrubPosition(update.position);
    setScrubDuration(update.duration);
  }, []);

  // Jog-wheel seek → drive both panels via seekWithSync
  const handleSeekStart = useCallback(() => {
    setIsSeeking(true);
    playback.pauseBoth();
  }, [playback]);

  const handleSeekChange = useCallback((positionMs: number) => {
    setScrubPosition(positionMs);
    playback.seekWithSync('left', positionMs);
  }, [playback]);

  const handleSeekComplete = useCallback((positionMs: number) => {
    setScrubPosition(positionMs);
    playback.seekWithSync('left', positionMs);
    setIsSeeking(false);
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
          { flexDirection: isLandscape ? 'row' as const : 'column' as const },
        ]}>
          <CompareVideoPanel
            ref={leftRef}
            uri={leftClip?.path ?? null}
            slotLabel="A"
            syncPointMs={playback.syncState.leftSyncPointMs}
            isSeeking={isSeeking}
            onSetSyncPoint={playback.setLeftSyncPoint}
            onPickClip={() => openPicker('left')}
            onPlaybackUpdate={handleLeftPlaybackUpdate}
          />
          <CompareVideoPanel
            ref={rightRef}
            uri={rightClip?.path ?? null}
            slotLabel="B"
            syncPointMs={playback.syncState.rightSyncPointMs}
            isSeeking={isSeeking}
            onSetSyncPoint={playback.setRightSyncPoint}
            onPickClip={() => openPicker('right')}
          />
        </View>

        <CompareControls
          isPlaying={playback.isPlaying}
          playbackRate={playback.playbackRate}
          isSynced={playback.isSynced}
          position={scrubPosition}
          duration={scrubDuration}
          onTogglePlay={playback.togglePlayBoth}
          onStepBackward={() => playback.stepBoth('backward')}
          onStepForward={() => playback.stepBoth('forward')}
          onCycleSpeed={playback.cycleSpeed}
          onClearSync={playback.clearSync}
          onSeekStart={handleSeekStart}
          onSeekChange={handleSeekChange}
          onSeekComplete={handleSeekComplete}
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
