import { describe, test, expect } from 'vitest';
import { readAppRole, isModerator } from '../roles';

describe('readAppRole', () => {
  test('reads a valid moderator role', () => {
    expect(readAppRole({ app_metadata: { role: 'moderator' } })).toBe('moderator');
  });

  test('reads a valid admin role', () => {
    expect(readAppRole({ app_metadata: { role: 'admin' } })).toBe('admin');
  });

  test('returns null for an unknown role string', () => {
    expect(readAppRole({ app_metadata: { role: 'superuser' } })).toBeNull();
  });

  test('returns null when app_metadata is absent', () => {
    expect(readAppRole({})).toBeNull();
  });

  test('returns null when claims is null, undefined, or not an object', () => {
    expect(readAppRole(null)).toBeNull();
    expect(readAppRole(undefined)).toBeNull();
    expect(readAppRole('not-an-object')).toBeNull();
  });

  test('returns null when app_metadata is not an object', () => {
    expect(readAppRole({ app_metadata: 'moderator' })).toBeNull();
  });
});

describe('isModerator', () => {
  test('true for moderator and admin', () => {
    expect(isModerator('moderator')).toBe(true);
    expect(isModerator('admin')).toBe(true);
  });

  test('false for null or undefined', () => {
    expect(isModerator(null)).toBe(false);
    expect(isModerator(undefined)).toBe(false);
  });
});
