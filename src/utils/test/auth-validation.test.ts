import { describe, it, expect } from 'vitest';
import { isValidEmail, isValidPassword, getPasswordError } from '../auth-validation';

describe('isValidEmail', () => {
  it('accepts standard emails', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('name+tag@domain.co')).toBe(true);
    expect(isValidEmail('a@b.io')).toBe(true);
  });

  it('trims whitespace', () => {
    expect(isValidEmail('  user@example.com  ')).toBe(true);
  });

  it('rejects missing @', () => {
    expect(isValidEmail('userexample.com')).toBe(false);
  });

  it('rejects missing domain', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('rejects missing local part', () => {
    expect(isValidEmail('@example.com')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });

  it('rejects spaces in address', () => {
    expect(isValidEmail('user @example.com')).toBe(false);
  });
});

describe('isValidPassword', () => {
  it('accepts 8+ character passwords', () => {
    expect(isValidPassword('12345678')).toBe(true);
    expect(isValidPassword('a very long password indeed')).toBe(true);
  });

  it('rejects passwords shorter than 8 characters', () => {
    expect(isValidPassword('1234567')).toBe(false);
    expect(isValidPassword('')).toBe(false);
  });
});

describe('getPasswordError', () => {
  it('returns null for valid passwords', () => {
    expect(getPasswordError('12345678')).toBeNull();
  });

  it('returns required message for empty string', () => {
    expect(getPasswordError('')).toBe('Password is required');
  });

  it('returns length message for short passwords', () => {
    expect(getPasswordError('short')).toBe('Password must be at least 8 characters');
  });
});
