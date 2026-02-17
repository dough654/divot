const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

/** Checks whether a string is a plausibly valid email address. */
export const isValidEmail = (email: string): boolean =>
  EMAIL_REGEX.test(email.trim());

/** Checks whether a password meets minimum requirements (8+ chars). */
export const isValidPassword = (password: string): boolean =>
  password.length >= MIN_PASSWORD_LENGTH;

/** Returns a human-readable error for a password, or null if valid. */
export const getPasswordError = (password: string): string | null => {
  if (password.length === 0) return 'Password is required';
  if (password.length < MIN_PASSWORD_LENGTH)
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  return null;
};
