/**
 * Unit tests for ranking (tie / mid-rank) utilities
 */

import { describe, test, expect } from 'vitest';
import { denseRanksToMidRanks, validateWeakOrder } from '../ranking';

/** Sum of mid-ranks must always equal N(N+1)/2 (rank-mass conservation). */
function rankMass(n: number): number {
  return (n * (n + 1)) / 2;
}

describe('ranking', () => {
  describe('denseRanksToMidRanks', () => {
    test('strict unique ranks are returned unchanged (backward compatible)', () => {
      const result = denseRanksToMidRanks({ A: 1, B: 2, C: 3, D: 4 });
      expect(result).toEqual({ A: 1, B: 2, C: 3, D: 4 });
    });

    test('a middle tie gets the mean of its occupied positions', () => {
      // [A=1, B=2, C=2, D=3] → A=1, B=2.5, C=2.5, D=4
      const result = denseRanksToMidRanks({ A: 1, B: 2, C: 2, D: 3 });
      expect(result).toEqual({ A: 1, B: 2.5, C: 2.5, D: 4 });
    });

    test('all items tied at rank 1 collapse to the mean rank (acts as abstention)', () => {
      // Five tied at rank 1 → every item becomes 3 (the mean of 1..5)
      const result = denseRanksToMidRanks({ a: 1, b: 1, c: 1, d: 1, e: 1 });
      expect(result).toEqual({ a: 3, b: 3, c: 3, d: 3, e: 3 });
    });

    test('a tie at the top spans the first two positions', () => {
      // [A=1, B=1, C=2] → A=1.5, B=1.5, C=3
      const result = denseRanksToMidRanks({ A: 1, B: 1, C: 2 });
      expect(result).toEqual({ A: 1.5, B: 1.5, C: 3 });
    });

    test('preserves total rank mass = N(N+1)/2 for any tie structure', () => {
      const cases: Record<string, number>[] = [
        { A: 1, B: 2, C: 3, D: 4 },
        { A: 1, B: 2, C: 2, D: 3 },
        { a: 1, b: 1, c: 1, d: 1, e: 1 },
        { A: 1, B: 1, C: 2, D: 3, E: 3, F: 3 },
      ];
      for (const input of cases) {
        const result = denseRanksToMidRanks(input);
        const n = Object.keys(input).length;
        const sum = Object.values(result).reduce((acc, r) => acc + r, 0);
        expect(sum).toBeCloseTo(rankMass(n), 10);
      }
    });

    test('handles empty input', () => {
      expect(denseRanksToMidRanks({})).toEqual({});
    });
  });

  describe('validateWeakOrder', () => {
    test('accepts strict contiguous ranks', () => {
      expect(validateWeakOrder([1, 2, 3, 4])).toBe(true);
    });

    test('accepts ties with contiguous tiers', () => {
      expect(validateWeakOrder([1, 2, 2, 3])).toBe(true);
      expect(validateWeakOrder([1, 1, 1])).toBe(true);
      expect(validateWeakOrder([1, 1, 2, 3, 3])).toBe(true);
    });

    test('rejects gaps between tiers', () => {
      expect(validateWeakOrder([1, 3])).toBe(false);
      expect(validateWeakOrder([1, 2, 4])).toBe(false);
      expect(validateWeakOrder([2, 3])).toBe(false);
    });

    test('rejects non-positive or non-integer ranks', () => {
      expect(validateWeakOrder([0, 1])).toBe(false);
      expect(validateWeakOrder([-1])).toBe(false);
      expect(validateWeakOrder([1, 1.5])).toBe(false);
    });

    test('rejects empty input', () => {
      expect(validateWeakOrder([])).toBe(false);
    });
  });
});
