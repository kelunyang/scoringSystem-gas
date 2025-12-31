/**
 * @fileoverview Bradley-Terry Model implementation for pairwise comparison ranking
 *
 * The Bradley-Terry Model estimates the "strength" of each item based on
 * pairwise comparison outcomes. Given comparisons where item A beats item B,
 * we can infer relative strength parameters for all items.
 *
 * Algorithm:
 * 1. Generate pairwise comparisons (full round-robin for ≤5 items, random sampling for more)
 * 2. Collect comparison results from AI
 * 3. Use MM (Minorization-Maximization) algorithm to estimate strength parameters
 * 4. Rank items by their estimated strengths
 *
 * References:
 * - Bradley, R.A. and Terry, M.E. (1952). "Rank Analysis of Incomplete Block Designs"
 * - Hunter, D.R. (2004). "MM algorithms for generalized Bradley-Terry models"
 */

import type { BTComparison, BTStrengthParams } from '@repo/shared';

/**
 * Configuration for comparison generation
 */
export interface ComparisonConfig {
  /** Number of comparisons per item (2-5, default 3) */
  pairsPerItem?: number;
  /** Random seed for reproducibility (optional) */
  seed?: number;
}

/**
 * Generate pairwise comparisons for items
 *
 * Strategy:
 * - For ≤5 items: Full round-robin (all possible pairs)
 * - For >5 items: Random sampling with pairsPerItem comparisons per item
 *
 * @param itemIds - Array of item IDs to compare
 * @param config - Configuration options
 * @returns Array of comparison pairs with indices
 */
export function generateComparisons(
  itemIds: string[],
  config?: ComparisonConfig
): BTComparison[] {
  const n = itemIds.length;

  if (n < 2) {
    throw new Error('At least 2 items are required for comparison');
  }

  const pairsPerItem = config?.pairsPerItem ?? 3;

  // For 5 or fewer items, do full round-robin
  if (n <= 5) {
    return generateFullRoundRobin(itemIds);
  }

  // For more items, use random sampling
  return generateRandomSampling(itemIds, pairsPerItem);
}

/**
 * Generate all possible pairs (full round-robin)
 * Total comparisons: n(n-1)/2
 *
 * @param itemIds - Array of item IDs
 * @returns All possible comparison pairs
 */
function generateFullRoundRobin(itemIds: string[]): BTComparison[] {
  const comparisons: BTComparison[] = [];
  let index = 1;

  for (let i = 0; i < itemIds.length; i++) {
    for (let j = i + 1; j < itemIds.length; j++) {
      comparisons.push({
        index,
        itemA: itemIds[i],
        itemB: itemIds[j]
      });
      index++;
    }
  }

  // Shuffle to avoid position bias
  return shuffleArray(comparisons).map((c, idx) => ({ ...c, index: idx + 1 }));
}

/**
 * Generate random sampling of comparisons
 * Each item appears in approximately pairsPerItem comparisons
 *
 * @param itemIds - Array of item IDs
 * @param pairsPerItem - Target number of comparisons per item
 * @returns Randomly sampled comparison pairs
 */
function generateRandomSampling(
  itemIds: string[],
  pairsPerItem: number
): BTComparison[] {
  const n = itemIds.length;
  const targetPairs = Math.ceil((n * pairsPerItem) / 2);

  // Generate all possible pairs
  const allPairs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      allPairs.push([i, j]);
    }
  }

  // Shuffle and select pairs
  const shuffled = shuffleArray(allPairs);
  const selectedPairs = shuffled.slice(0, Math.min(targetPairs, shuffled.length));

  // Convert to BTComparison format
  return selectedPairs.map(([i, j], idx) => ({
    index: idx + 1,
    itemA: itemIds[i],
    itemB: itemIds[j]
  }));
}

/**
 * Fisher-Yates shuffle algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Compute Bradley-Terry strength parameters using MM algorithm
 *
 * The MM algorithm iteratively updates strength parameters based on
 * the likelihood of observed comparison outcomes.
 *
 * @param comparisons - Completed comparisons with winners
 * @param itemIds - Array of all item IDs
 * @param maxIterations - Maximum iterations (default 100)
 * @param tolerance - Convergence tolerance (default 1e-6)
 * @returns Strength parameters for each item (log-scale)
 */
export function computeBTStrengthParams(
  comparisons: BTComparison[],
  itemIds: string[],
  maxIterations = 100,
  tolerance = 1e-6
): BTStrengthParams {
  const n = itemIds.length;

  // Build win/loss matrices
  // wins[i][j] = number of times item i beat item j
  const wins: Map<string, Map<string, number>> = new Map();
  const played: Map<string, Map<string, number>> = new Map();

  for (const id of itemIds) {
    wins.set(id, new Map());
    played.set(id, new Map());
    for (const otherId of itemIds) {
      wins.get(id)!.set(otherId, 0);
      played.get(id)!.set(otherId, 0);
    }
  }

  // Populate matrices from comparisons
  for (const comp of comparisons) {
    if (!comp.winner) continue;

    const { itemA, itemB, winner } = comp;
    const loser = winner === itemA ? itemB : itemA;

    wins.get(winner)!.set(loser, (wins.get(winner)!.get(loser) ?? 0) + 1);
    played.get(itemA)!.set(itemB, (played.get(itemA)!.get(itemB) ?? 0) + 1);
    played.get(itemB)!.set(itemA, (played.get(itemB)!.get(itemA) ?? 0) + 1);
  }

  // Initialize strength parameters (all equal)
  let strength: Map<string, number> = new Map();
  for (const id of itemIds) {
    strength.set(id, 1.0 / n);
  }

  // MM algorithm iterations
  for (let iter = 0; iter < maxIterations; iter++) {
    const newStrength: Map<string, number> = new Map();

    for (const i of itemIds) {
      // Sum of wins for item i
      let totalWins = 0;
      for (const j of itemIds) {
        if (i !== j) {
          totalWins += wins.get(i)!.get(j) ?? 0;
        }
      }

      // Denominator: sum over all opponents
      let denom = 0;
      for (const j of itemIds) {
        if (i !== j) {
          const nij = played.get(i)!.get(j) ?? 0;
          if (nij > 0) {
            const pi = strength.get(i)!;
            const pj = strength.get(j)!;
            denom += nij / (pi + pj);
          }
        }
      }

      // Update strength
      if (denom > 0) {
        newStrength.set(i, totalWins / denom);
      } else {
        // No comparisons, keep current value
        newStrength.set(i, strength.get(i)!);
      }
    }

    // Normalize to sum to 1
    const total = Array.from(newStrength.values()).reduce((a, b) => a + b, 0);
    for (const id of itemIds) {
      newStrength.set(id, (newStrength.get(id) ?? 0) / total);
    }

    // Check convergence
    let maxDiff = 0;
    for (const id of itemIds) {
      maxDiff = Math.max(maxDiff, Math.abs((newStrength.get(id) ?? 0) - (strength.get(id) ?? 0)));
    }

    strength = newStrength;

    if (maxDiff < tolerance) {
      break;
    }
  }

  // Convert to object and use log-scale for better interpretability
  const result: BTStrengthParams = {};
  for (const id of itemIds) {
    // Log-scale, normalized so median is 0
    result[id] = Math.log(strength.get(id)!);
  }

  // Normalize so median is 0
  const values = Object.values(result).sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];
  for (const id of itemIds) {
    result[id] = result[id] - median;
  }

  return result;
}

/**
 * Rank items by their Bradley-Terry strength parameters
 *
 * @param strengthParams - Strength parameters from computeBTStrengthParams
 * @returns Array of item IDs sorted from strongest to weakest
 */
export function rankByStrength(strengthParams: BTStrengthParams): string[] {
  return Object.entries(strengthParams)
    .sort(([, a], [, b]) => b - a) // Descending order (higher strength = better rank)
    .map(([id]) => id);
}

/**
 * Compute the complete BT ranking from comparisons
 *
 * @param comparisons - Completed comparisons with winners
 * @param itemIds - Array of all item IDs
 * @returns Object with ranking and strength parameters
 */
export function computeBTRanking(
  comparisons: BTComparison[],
  itemIds: string[]
): { ranking: string[]; strengthParams: BTStrengthParams } {
  const strengthParams = computeBTStrengthParams(comparisons, itemIds);
  const ranking = rankByStrength(strengthParams);

  return { ranking, strengthParams };
}

/**
 * Get expected number of comparisons for given items and config
 *
 * @param itemCount - Number of items
 * @param pairsPerItem - Pairs per item for random sampling
 * @returns Expected number of comparisons
 */
export function getExpectedComparisonCount(
  itemCount: number,
  pairsPerItem = 3
): number {
  if (itemCount <= 5) {
    // Full round-robin: n(n-1)/2
    return (itemCount * (itemCount - 1)) / 2;
  }
  // Random sampling: approximately n * pairsPerItem / 2
  return Math.ceil((itemCount * pairsPerItem) / 2);
}

/**
 * Combine reasons from all comparisons into a summary
 *
 * @param comparisons - Completed comparisons with reasons
 * @returns Combined reasoning summary
 */
export function combineComparisonReasons(comparisons: BTComparison[]): string {
  const validComparisons = comparisons.filter(c => c.winner && c.reason);

  if (validComparisons.length === 0) {
    return '無可用的比較結果';
  }

  // Group by winner
  const winsByItem: Map<string, string[]> = new Map();
  for (const comp of validComparisons) {
    if (!winsByItem.has(comp.winner!)) {
      winsByItem.set(comp.winner!, []);
    }
    const opponent = comp.winner === comp.itemA ? comp.itemB : comp.itemA;
    winsByItem.get(comp.winner!)!.push(`vs ${opponent.slice(-6)}: ${comp.reason}`);
  }

  // Build summary
  const parts: string[] = [];
  for (const [itemId, reasons] of winsByItem) {
    parts.push(`【${itemId.slice(-6)}】贏了 ${reasons.length} 場`);
  }

  return `基於 ${validComparisons.length} 次配對比較的結果。` + parts.slice(0, 3).join('；') +
    (parts.length > 3 ? '...' : '');
}
