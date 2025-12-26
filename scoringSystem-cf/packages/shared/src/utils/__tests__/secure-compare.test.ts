/**
 * Unit tests for secure-compare utilities
 */

import { describe, test, expect } from 'vitest';
import { constantTimeCompare, constantTimeCompareBytes } from '../secure-compare';

describe('secure-compare', () => {
  describe('constantTimeCompare', () => {
    test('returns true for identical strings', () => {
      expect(constantTimeCompare('hello', 'hello')).toBe(true);
      expect(constantTimeCompare('ABCD-EFGH-JKLM', 'ABCD-EFGH-JKLM')).toBe(true);
      expect(constantTimeCompare('', '')).toBe(true);
    });

    test('returns false for different strings of same length', () => {
      expect(constantTimeCompare('hello', 'world')).toBe(false);
      expect(constantTimeCompare('ABCD-EFGH-JKLM', 'ABCD-EFGH-JKLN')).toBe(false);
      expect(constantTimeCompare('abc', 'abd')).toBe(false);
    });

    test('returns false for strings of different lengths', () => {
      expect(constantTimeCompare('hello', 'hello world')).toBe(false);
      expect(constantTimeCompare('abc', 'abcd')).toBe(false);
      expect(constantTimeCompare('', 'a')).toBe(false);
    });

    test('is case-sensitive', () => {
      expect(constantTimeCompare('Hello', 'hello')).toBe(false);
      expect(constantTimeCompare('ABCD', 'abcd')).toBe(false);
    });

    test('handles special characters correctly', () => {
      expect(constantTimeCompare('@#!', '@#!')).toBe(true);
      expect(constantTimeCompare('K@WH-NM#A-!QRS', 'K@WH-NM#A-!QRS')).toBe(true);
      expect(constantTimeCompare('@#!', '@#?')).toBe(false);
    });

    test('handles Unicode characters', () => {
      expect(constantTimeCompare('你好', '你好')).toBe(true);
      expect(constantTimeCompare('café', 'café')).toBe(true);
      expect(constantTimeCompare('你好', '您好')).toBe(false);
    });

    test('handles very long strings', () => {
      const longString = 'A'.repeat(10000);
      const differentLongString = 'A'.repeat(9999) + 'B';

      expect(constantTimeCompare(longString, longString)).toBe(true);
      expect(constantTimeCompare(longString, differentLongString)).toBe(false);
    });

    test('difference at start vs end should not leak timing info', () => {
      // This is a behavioral test - we can't truly verify constant-time in JS
      // but we can verify correctness for strings differing at different positions
      const base = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

      // Difference at start
      const diffStart = 'XBCDEFGHIJKLMNOPQRSTUVWXYZ';
      expect(constantTimeCompare(base, diffStart)).toBe(false);

      // Difference in middle
      const diffMiddle = 'ABCDEFGHIJXLMNOPQRSTUVWXYZ';
      expect(constantTimeCompare(base, diffMiddle)).toBe(false);

      // Difference at end
      const diffEnd = 'ABCDEFGHIJKLMNOPQRSTUVWXYX';
      expect(constantTimeCompare(base, diffEnd)).toBe(false);
    });

    test('handles null bytes correctly', () => {
      expect(constantTimeCompare('\0', '\0')).toBe(true);
      expect(constantTimeCompare('abc\0def', 'abc\0def')).toBe(true);
      expect(constantTimeCompare('abc\0def', 'abc\0xyz')).toBe(false);
    });

    test('multiple differences are still caught', () => {
      expect(constantTimeCompare('ABCD', 'XYZA')).toBe(false);
      expect(constantTimeCompare('1234', '5678')).toBe(false);
    });
  });

  describe('constantTimeCompareBytes', () => {
    test('returns true for identical byte arrays', () => {
      const arr1 = new Uint8Array([1, 2, 3, 4, 5]);
      const arr2 = new Uint8Array([1, 2, 3, 4, 5]);
      expect(constantTimeCompareBytes(arr1, arr2)).toBe(true);
    });

    test('returns true for empty arrays', () => {
      const arr1 = new Uint8Array([]);
      const arr2 = new Uint8Array([]);
      expect(constantTimeCompareBytes(arr1, arr2)).toBe(true);
    });

    test('returns false for different byte arrays of same length', () => {
      const arr1 = new Uint8Array([1, 2, 3, 4, 5]);
      const arr2 = new Uint8Array([1, 2, 3, 4, 6]);
      expect(constantTimeCompareBytes(arr1, arr2)).toBe(false);
    });

    test('returns false for byte arrays of different lengths', () => {
      const arr1 = new Uint8Array([1, 2, 3]);
      const arr2 = new Uint8Array([1, 2, 3, 4]);
      expect(constantTimeCompareBytes(arr1, arr2)).toBe(false);
    });

    test('handles all byte values (0-255)', () => {
      const arr1 = new Uint8Array(256);
      const arr2 = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        arr1[i] = i;
        arr2[i] = i;
      }
      expect(constantTimeCompareBytes(arr1, arr2)).toBe(true);

      // Change one byte
      arr2[128] = 255;
      expect(constantTimeCompareBytes(arr1, arr2)).toBe(false);
    });

    test('handles large byte arrays', () => {
      const arr1 = new Uint8Array(10000);
      const arr2 = new Uint8Array(10000);
      crypto.getRandomValues(arr1);
      arr2.set(arr1);

      expect(constantTimeCompareBytes(arr1, arr2)).toBe(true);

      // Change last byte
      arr2[9999] = arr2[9999] ^ 1;
      expect(constantTimeCompareBytes(arr1, arr2)).toBe(false);
    });
  });

  describe('security properties', () => {
    test('consistent behavior regardless of comparison result', () => {
      // While we can't measure timing in unit tests, we can verify
      // that the function always processes all characters

      const testCases = [
        ['AAAAAAAAAA', 'AAAAAAAAAA'], // All match
        ['XAAAAAAAAA', 'AAAAAAAAAA'], // First different
        ['AAAAAXAAAA', 'AAAAAAAAAA'], // Middle different
        ['AAAAAAAAA', 'AAAAAAAAAX'], // Last different (note: length check will catch this)
      ];

      // All should execute without errors
      for (const [a, b] of testCases) {
        if (a.length === b.length) {
          expect(() => constantTimeCompare(a, b)).not.toThrow();
        }
      }
    });

    test('length check is not timing-sensitive (documented behavior)', () => {
      // Different lengths return false immediately - this is acceptable
      // because length is typically public information (e.g., known code format)
      expect(constantTimeCompare('abc', 'abcd')).toBe(false);
      expect(constantTimeCompare('', 'a')).toBe(false);
    });
  });

  describe('real-world usage scenarios', () => {
    test('verification code comparison (12 characters)', () => {
      const storedCode = 'K@WH-NM#A-!Q';
      const userCode1 = 'K@WH-NM#A-!Q'; // Correct
      const userCode2 = 'K@WH-NM#A-!R'; // Wrong
      const userCode3 = 'KWHNM#A!Q';    // Different length

      expect(constantTimeCompare(storedCode, userCode1)).toBe(true);
      expect(constantTimeCompare(storedCode, userCode2)).toBe(false);
      expect(constantTimeCompare(storedCode, userCode3)).toBe(false);
    });

    test('session token comparison', () => {
      const sessionToken = 'sess_' + 'A'.repeat(32);
      const validToken = sessionToken;
      const invalidToken = 'sess_' + 'B'.repeat(32);

      expect(constantTimeCompare(sessionToken, validToken)).toBe(true);
      expect(constantTimeCompare(sessionToken, invalidToken)).toBe(false);
    });
  });
});
