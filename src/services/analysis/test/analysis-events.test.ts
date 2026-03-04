import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  onAnalysisEvent,
  emitAnalysisEvent,
  clearAllListeners,
} from '../analysis-events';

beforeEach(() => {
  clearAllListeners();
});

describe('onAnalysisEvent', () => {
  it('calls listener when matching event is emitted', () => {
    const listener = vi.fn();
    onAnalysisEvent('completed', listener);

    emitAnalysisEvent('completed', { clipId: 'clip-1' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ clipId: 'clip-1' });
  });

  it('does not call listener for non-matching event type', () => {
    const listener = vi.fn();
    onAnalysisEvent('completed', listener);

    emitAnalysisEvent('started', { clipId: 'clip-1' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('supports multiple listeners for the same event', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    onAnalysisEvent('completed', listener1);
    onAnalysisEvent('completed', listener2);

    emitAnalysisEvent('completed', { clipId: 'clip-1' });

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes when returned function is called', () => {
    const listener = vi.fn();
    const unsubscribe = onAnalysisEvent('completed', listener);

    emitAnalysisEvent('completed', { clipId: 'clip-1' });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();

    emitAnalysisEvent('completed', { clipId: 'clip-2' });
    expect(listener).toHaveBeenCalledTimes(1); // Not called again
  });

  it('passes error in payload for failed events', () => {
    const listener = vi.fn();
    onAnalysisEvent('failed', listener);

    emitAnalysisEvent('failed', { clipId: 'clip-1', error: 'Model failed' });

    expect(listener).toHaveBeenCalledWith({
      clipId: 'clip-1',
      error: 'Model failed',
    });
  });

  it('passes progress in payload for progress events', () => {
    const listener = vi.fn();
    onAnalysisEvent('progress', listener);

    emitAnalysisEvent('progress', { clipId: 'clip-1', progress: 0.5 });

    expect(listener).toHaveBeenCalledWith({
      clipId: 'clip-1',
      progress: 0.5,
    });
  });
});

describe('emitAnalysisEvent', () => {
  it('does not throw when no listeners registered', () => {
    expect(() =>
      emitAnalysisEvent('completed', { clipId: 'clip-1' }),
    ).not.toThrow();
  });

  it('continues calling remaining listeners if one throws', () => {
    const badListener = vi.fn(() => {
      throw new Error('boom');
    });
    const goodListener = vi.fn();

    onAnalysisEvent('completed', badListener);
    onAnalysisEvent('completed', goodListener);

    emitAnalysisEvent('completed', { clipId: 'clip-1' });

    expect(badListener).toHaveBeenCalledTimes(1);
    expect(goodListener).toHaveBeenCalledTimes(1);
  });
});

describe('clearAllListeners', () => {
  it('removes all listeners', () => {
    const listener = vi.fn();
    onAnalysisEvent('completed', listener);
    onAnalysisEvent('started', listener);

    clearAllListeners();

    emitAnalysisEvent('completed', { clipId: 'clip-1' });
    emitAnalysisEvent('started', { clipId: 'clip-1' });

    expect(listener).not.toHaveBeenCalled();
  });
});
