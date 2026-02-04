export type BackoffConfig = {
  baseDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  jitterFactor: number;
};

export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  maxAttempts: 5,
  jitterFactor: 0.3,
};

/**
 * Calculates the delay for an exponential backoff attempt.
 * Returns null if the attempt exceeds maxAttempts.
 *
 * Formula: min(base * 2^attempt, max) * (1 + random * jitter * randomSign)
 */
export const calculateBackoffDelay = (
  attempt: number,
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG
): number | null => {
  if (attempt >= config.maxAttempts) {
    return null;
  }

  const exponentialDelay = Math.min(
    config.baseDelayMs * Math.pow(2, attempt),
    config.maxDelayMs
  );

  const jitter = exponentialDelay * config.jitterFactor * (Math.random() * 2 - 1);

  return Math.max(0, Math.round(exponentialDelay + jitter));
};
