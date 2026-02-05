import { describe, it, expect } from 'vitest';
import {
  connectionErrors,
  permissionErrors,
  recordingErrors,
  syncErrors,
  getIceConnectionError,
  getSignalingError,
  genericError,
} from '../error-messages';

describe('connectionErrors', () => {
  it('has required fields for all error types', () => {
    const errorTypes = Object.values(connectionErrors);

    for (const error of errorTypes) {
      expect(error.title).toBeDefined();
      expect(error.title.length).toBeGreaterThan(0);
      expect(error.message).toBeDefined();
      expect(error.message.length).toBeGreaterThan(0);
      expect(error.recoveryActions).toBeDefined();
      expect(error.recoveryActions.length).toBeGreaterThan(0);
    }
  });

  it('has at least one recovery action per error', () => {
    const errorTypes = Object.values(connectionErrors);

    for (const error of errorTypes) {
      expect(error.recoveryActions.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('has primary action marked for most errors', () => {
    // Most errors should have a primary action
    const errorsWithPrimary = Object.values(connectionErrors).filter(
      (error) => error.recoveryActions.some((action) => 'primary' in action && action.primary)
    );

    // At least 50% should have a primary action
    expect(errorsWithPrimary.length).toBeGreaterThan(
      Object.values(connectionErrors).length / 2
    );
  });
});

describe('permissionErrors', () => {
  it('has camera and microphone permission errors', () => {
    expect(permissionErrors.cameraPermissionDenied).toBeDefined();
    expect(permissionErrors.microphonePermissionDenied).toBeDefined();
  });

  it('includes settings action for permission errors', () => {
    const cameraActions = permissionErrors.cameraPermissionDenied.recoveryActions;
    const settingsAction = cameraActions.find((a) => a.action === 'settings');
    expect(settingsAction).toBeDefined();
  });
});

describe('recordingErrors', () => {
  it('has required error types', () => {
    expect(recordingErrors.recordingFailed).toBeDefined();
    expect(recordingErrors.saveFailed).toBeDefined();
    expect(recordingErrors.noCamera).toBeDefined();
  });
});

describe('syncErrors', () => {
  it('has required error types', () => {
    expect(syncErrors.transferFailed).toBeDefined();
    expect(syncErrors.transferCancelled).toBeDefined();
    expect(syncErrors.noConnection).toBeDefined();
  });
});

describe('getIceConnectionError', () => {
  it('returns error info for failed state', () => {
    const error = getIceConnectionError('failed');
    expect(error).not.toBeNull();
    expect(error?.title).toBeDefined();
  });

  it('returns error info for disconnected state', () => {
    const error = getIceConnectionError('disconnected');
    expect(error).not.toBeNull();
  });

  it('returns null for connected state', () => {
    const error = getIceConnectionError('connected');
    expect(error).toBeNull();
  });

  it('returns null for checking state', () => {
    const error = getIceConnectionError('checking');
    expect(error).toBeNull();
  });

  it('returns null for new state', () => {
    const error = getIceConnectionError('new');
    expect(error).toBeNull();
  });
});

describe('getSignalingError', () => {
  it('returns roomNotFound for ROOM_NOT_FOUND code', () => {
    const error = getSignalingError('ROOM_NOT_FOUND');
    expect(error.title).toBe('Room Not Found');
  });

  it('returns roomFull for ROOM_FULL code', () => {
    const error = getSignalingError('ROOM_FULL');
    expect(error.title).toBe('Room Full');
  });

  it('returns signalingFailed for CONNECTION_FAILED code', () => {
    const error = getSignalingError('CONNECTION_FAILED');
    expect(error.title).toBe('Server Unavailable');
  });

  it('returns timeout for TIMEOUT code', () => {
    const error = getSignalingError('TIMEOUT');
    expect(error.title).toBe('Connection Timeout');
  });

  it('returns signalingFailed for unknown codes', () => {
    const error = getSignalingError('UNKNOWN_ERROR');
    expect(error.title).toBe('Server Unavailable');
  });
});

describe('genericError', () => {
  it('has retry and dismiss actions', () => {
    const actions = genericError.recoveryActions.map((a) => a.action);
    expect(actions).toContain('retry');
    expect(actions).toContain('dismiss');
  });

  it('has primary action', () => {
    const primaryAction = genericError.recoveryActions.find((a) => a.primary);
    expect(primaryAction).toBeDefined();
  });
});

describe('recovery action types', () => {
  it('uses valid action types', () => {
    const validActions = ['retry', 'rescan', 'settings', 'dismiss', 'hotspot', 'wifi'];

    const allErrors = [
      ...Object.values(connectionErrors),
      ...Object.values(permissionErrors),
      ...Object.values(recordingErrors),
      ...Object.values(syncErrors),
      genericError,
    ];

    for (const error of allErrors) {
      for (const action of error.recoveryActions) {
        expect(validActions).toContain(action.action);
      }
    }
  });
});
