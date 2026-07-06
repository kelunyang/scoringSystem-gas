/**
 * Settlement tie (同名) scoring tests
 *
 * Verifies that dense weak-order ballots are normalized to mid-ranks during
 * settlement, so tied items end up with equal final ranks and equal point
 * allocations (via the occupied-rank distribution), while strict ballots behave
 * exactly as before.
 */

import { describe, test, expect } from 'vitest';
import { calculateWeightedScoresFromVotes } from '@handlers/scoring/settlement';

describe('Settlement tie scoring', () => {
  test('strict unique ballots are unchanged (regression)', () => {
    const ballot = { rankings: { A: 1, B: 2, C: 3, D: 4 } };
    const result = calculateWeightedScoresFromVotes(
      [{ voterEmail: 't1', ...ballot }],
      [{ voterEmail: 'g1', ...ballot }],
      1000
    );

    expect(result.rankings).toEqual({ A: 1, B: 2, C: 3, D: 4 });
    // Strictly decreasing points by rank
    expect(result.scores.A).toBeGreaterThan(result.scores.B);
    expect(result.scores.B).toBeGreaterThan(result.scores.C);
    expect(result.scores.C).toBeGreaterThan(result.scores.D);
  });

  test('a tie in the ballot yields equal final rank and equal points', () => {
    // B and C tied for the second tier on every ballot
    const ballot = { rankings: { A: 1, B: 2, C: 2, D: 3 } };
    const result = calculateWeightedScoresFromVotes(
      [{ voterEmail: 't1', ...ballot }],
      [{ voterEmail: 'g1', ...ballot }],
      1000
    );

    // B and C share the same final rank and the same points
    expect(result.rankings.B).toBe(result.rankings.C);
    expect(result.scores.B).toBe(result.scores.C);

    // Ordering is still A (best) > B=C > D (worst)
    expect(result.rankings.A).toBeLessThan(result.rankings.B);
    expect(result.rankings.B).toBeLessThan(result.rankings.D);
    expect(result.scores.A).toBeGreaterThan(result.scores.B);
    expect(result.scores.B).toBeGreaterThan(result.scores.D);

    // Whole reward pool is distributed
    const total = Object.values(result.scores).reduce((a, b) => a + b, 0);
    expect(total).toBe(1000);
  });

  test('marking everything as rank 1 makes all items tie (acts as abstention)', () => {
    const ballot = { rankings: { A: 1, B: 1, C: 1, D: 1, E: 1 } };
    const result = calculateWeightedScoresFromVotes(
      [{ voterEmail: 't1', ...ballot }],
      [{ voterEmail: 'g1', ...ballot }],
      1000
    );

    // All five share the same final rank...
    const ranks = Object.values(result.rankings);
    expect(new Set(ranks).size).toBe(1);

    // ...and points are split roughly evenly (within rounding)
    for (const id of ['A', 'B', 'C', 'D', 'E']) {
      expect(result.scores[id]).toBeGreaterThanOrEqual(199);
      expect(result.scores[id]).toBeLessThanOrEqual(201);
    }
    const total = Object.values(result.scores).reduce((a, b) => a + b, 0);
    expect(total).toBe(1000);
  });
});
