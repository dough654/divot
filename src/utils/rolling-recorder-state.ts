/**
 * Pure state machine for the rolling recorder.
 *
 * State transitions are deterministic and side-effect-free, making them
 * easy to test. The hook (`useRollingRecorder`) drives this machine and
 * performs the actual recording API calls.
 *
 * Key platform behavior: cancelRecording() on iOS triggers
 * onRecordingFinished (not onRecordingError). The new segment must only
 * start from the finalization callback, never from cancelRecording()'s
 * promise, to ensure VisionCamera has fully finalized the previous
 * segment.
 *
 * Fixed-window capture: when a swing is detected, the current buffer
 * segment continues recording for a short post-roll duration (default
 * 1.5s), then stops and saves. Pre-roll is natural — the segment was
 * already recording before detection. No swing-end detection needed.
 */

export type RollingRecorderState =
  | 'idle'
  | 'buffering'
  | 'transitioning'
  | 'post-rolling';

export type RollingRecorderAction =
  | { type: 'enable' }
  | { type: 'disable' }
  | { type: 'suspend' }
  | { type: 'resume' }
  | { type: 'cycleExpired' }
  | { type: 'cancelFinalized' }
  | { type: 'swingDetected' }
  | { type: 'postRollExpired' }
  | { type: 'recordingSaved' }
  | { type: 'recordingError' };

export type RollingRecorderEffect =
  | 'startRecording'
  | 'cancelRecording'
  | 'stopRecording'
  | 'scheduleCycle'
  | 'clearCycleTimer'
  | 'schedulePostRoll'
  | 'clearPostRollTimer';

export type StateTransition = {
  state: RollingRecorderState;
  effects: RollingRecorderEffect[];
};

/**
 * Pure state transition function for the rolling recorder.
 *
 * Returns the next state and a list of side effects to execute.
 */
export const nextRollingRecorderState = (
  currentState: RollingRecorderState,
  action: RollingRecorderAction,
  suspended: boolean,
): StateTransition => {
  switch (action.type) {
    case 'enable': {
      if (currentState !== 'idle' || suspended) {
        return { state: currentState, effects: [] };
      }
      return { state: 'buffering', effects: ['startRecording', 'scheduleCycle'] };
    }

    case 'disable':
    case 'suspend': {
      if (currentState === 'idle') {
        return { state: 'idle', effects: [] };
      }
      const effects: RollingRecorderEffect[] = ['clearCycleTimer', 'clearPostRollTimer'];
      if (currentState === 'buffering' || currentState === 'post-rolling') {
        effects.push('cancelRecording');
      }
      return { state: 'idle', effects };
    }

    case 'resume': {
      if (currentState !== 'idle') {
        return { state: currentState, effects: [] };
      }
      return { state: 'buffering', effects: ['startRecording', 'scheduleCycle'] };
    }

    case 'cycleExpired': {
      if (currentState !== 'buffering') {
        return { state: currentState, effects: [] };
      }
      return { state: 'transitioning', effects: ['cancelRecording'] };
    }

    case 'cancelFinalized': {
      // Fired when onRecordingFinished (iOS) or onRecordingError with
      // capture/recording-canceled (Android) is called after cancelRecording.
      if (currentState === 'transitioning') {
        if (suspended) {
          return { state: 'idle', effects: [] };
        }
        return { state: 'buffering', effects: ['startRecording', 'scheduleCycle'] };
      }
      return { state: currentState, effects: [] };
    }

    case 'swingDetected': {
      if (currentState === 'buffering') {
        // Keep current segment recording, stop cycling, schedule post-roll stop
        return { state: 'post-rolling', effects: ['clearCycleTimer', 'schedulePostRoll'] };
      }
      // During transitioning or other states — ignore (transition is <200ms,
      // next swing will be caught after buffering resumes)
      return { state: currentState, effects: [] };
    }

    case 'postRollExpired': {
      if (currentState !== 'post-rolling') {
        return { state: currentState, effects: [] };
      }
      return { state: currentState, effects: ['stopRecording'] };
      // State transitions when recordingSaved fires
    }

    case 'recordingSaved': {
      if (suspended) {
        return { state: 'idle', effects: [] };
      }
      // Re-arm buffering
      return { state: 'buffering', effects: ['startRecording', 'scheduleCycle'] };
    }

    case 'recordingError': {
      return { state: 'idle', effects: ['clearCycleTimer', 'clearPostRollTimer'] };
    }

    default:
      return { state: currentState, effects: [] };
  }
};
