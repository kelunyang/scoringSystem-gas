/**
 * Unit tests for code-generator utilities
 */

import { describe, test, expect } from 'vitest';
import {
  generateReadableCode,
  generateInvitationCode,
  generateVerificationCode,
  validateCodeFormat,
  getCodeCharacterSet
} from '../code-generator';

describe('code-generator', () => {
  describe('generateReadableCode', () => {
    test('generates code with correct length', () => {
      const code = generateReadableCode();
      const cleanCode = code.replace(/-/g, '');
      expect(cleanCode).toHaveLength(12);
    });

    test('generates code with correct format (4-4-4)', () => {
      const code = generateReadableCode({ format: '4-4-4' });
      // Should match XXXX-XXXX-XXXX pattern
      expect(code).toMatch(/^[A-Z@#!]{4}-[A-Z@#!]{4}-[A-Z@#!]{4}$/);
    });

    test('generates code with custom length', () => {
      const code = generateReadableCode({ length: 6, format: '3-3' });
      expect(code).toMatch(/^[A-Z@#!]{3}-[A-Z@#!]{3}$/);
      expect(code.replace(/-/g, '')).toHaveLength(6);
    });

    test('generates code without formatting', () => {
      const code = generateReadableCode({ length: 12, format: '' });
      expect(code).toMatch(/^[A-Z@#!]{12}$/);
      expect(code).not.toContain('-');
    });

    test('uses only valid characters from character set', () => {
      const charset = getCodeCharacterSet();
      const code = generateReadableCode().replace(/-/g, '');

      for (const char of code) {
        expect(charset).toContain(char);
      }
    });

    test('does not include excluded characters (I, O)', () => {
      // Generate many codes to increase confidence
      for (let i = 0; i < 100; i++) {
        const code = generateReadableCode().replace(/-/g, '');
        expect(code).not.toContain('I');
        expect(code).not.toContain('O');
      }
    });

    test('generates unique codes (no collisions in 1000 attempts)', () => {
      const codes = new Set<string>();
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        codes.add(generateReadableCode());
      }

      // All codes should be unique
      expect(codes.size).toBe(iterations);
    });

    test('has good randomness distribution', () => {
      const charCounts = new Map<string, number>();
      const iterations = 10000;

      for (let i = 0; i < iterations; i++) {
        const code = generateReadableCode().replace(/-/g, '');
        for (const char of code) {
          charCounts.set(char, (charCounts.get(char) || 0) + 1);
        }
      }

      // Each character should appear roughly iterations * 12 / 27 times
      const expected = (iterations * 12) / 27;
      const tolerance = expected * 0.2; // 20% tolerance

      for (const [char, count] of charCounts) {
        expect(count).toBeGreaterThan(expected - tolerance);
        expect(count).toBeLessThan(expected + tolerance);
      }
    });
  });

  describe('generateInvitationCode', () => {
    test('generates 12-character code with 4-4-4 format', () => {
      const code = generateInvitationCode();
      expect(code).toMatch(/^[A-Z@#!]{4}-[A-Z@#!]{4}-[A-Z@#!]{4}$/);
    });

    test('generates different codes on each call', () => {
      const code1 = generateInvitationCode();
      const code2 = generateInvitationCode();
      expect(code1).not.toBe(code2);
    });
  });

  describe('generateVerificationCode', () => {
    test('generates 12-character code with 4-4-4 format', () => {
      const code = generateVerificationCode();
      expect(code).toMatch(/^[A-Z@#!]{4}-[A-Z@#!]{4}-[A-Z@#!]{4}$/);
    });

    test('generates different codes on each call', () => {
      const code1 = generateVerificationCode();
      const code2 = generateVerificationCode();
      expect(code1).not.toBe(code2);
    });
  });

  describe('validateCodeFormat', () => {
    test('accepts valid code with hyphens', () => {
      expect(validateCodeFormat('ABCD-EFGH-JKLM')).toBe(true);
    });

    test('accepts valid code without hyphens', () => {
      expect(validateCodeFormat('ABCDEFGHJKLM')).toBe(true);
    });

    test('accepts code with symbols @#!', () => {
      expect(validateCodeFormat('K@WH-NM#A-!QRS')).toBe(true);
      expect(validateCodeFormat('@ABC-DEFG-H!JK')).toBe(true);
      expect(validateCodeFormat('####-@@@@-!!!!')).toBe(true);
    });

    test('rejects code with excluded character I', () => {
      expect(validateCodeFormat('ABCD-EFGH-IJKL')).toBe(false);
    });

    test('rejects code with excluded character O', () => {
      expect(validateCodeFormat('ABCD-EFGH-OKML')).toBe(false);
    });

    test('rejects code with digits', () => {
      expect(validateCodeFormat('ABCD-EFGH-1234')).toBe(false);
      expect(validateCodeFormat('K0WH-NMDA-TQRS')).toBe(false);
    });

    test('rejects code with wrong length (too short)', () => {
      expect(validateCodeFormat('ABCD-EFGH')).toBe(false);
      expect(validateCodeFormat('ABC-DEF')).toBe(false);
    });

    test('rejects code with wrong length (too long)', () => {
      expect(validateCodeFormat('ABCD-EFGH-JKLM-NOPQ')).toBe(false);
    });

    test('rejects code with lowercase letters', () => {
      expect(validateCodeFormat('abcd-efgh-jklm')).toBe(false);
    });

    test('rejects code with invalid symbols', () => {
      expect(validateCodeFormat('ABCD-EFGH-JK$M')).toBe(false);
      expect(validateCodeFormat('ABCD-EFGH-JK*M')).toBe(false);
    });

    test('rejects empty string', () => {
      expect(validateCodeFormat('')).toBe(false);
    });

    test('accepts code with custom expected length', () => {
      expect(validateCodeFormat('ABCDEF', 6)).toBe(true);
      expect(validateCodeFormat('ABC-DEF', 6)).toBe(true);
      expect(validateCodeFormat('ABCDEF', 12)).toBe(false); // Wrong length
    });
  });

  describe('getCodeCharacterSet', () => {
    test('returns correct character set', () => {
      const charset = getCodeCharacterSet();
      expect(charset).toBe('ABCDEFGHJKLMNPQRSTUVWXYZ@#!');
    });

    test('character set has correct length (27)', () => {
      const charset = getCodeCharacterSet();
      expect(charset).toHaveLength(27);
    });

    test('character set does not include I or O', () => {
      const charset = getCodeCharacterSet();
      expect(charset).not.toContain('I');
      expect(charset).not.toContain('O');
    });

    test('character set includes symbols @#!', () => {
      const charset = getCodeCharacterSet();
      expect(charset).toContain('@');
      expect(charset).toContain('#');
      expect(charset).toContain('!');
    });
  });
});
