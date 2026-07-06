/**
 * Ranking utilities for the "tie" (同名) mechanism.
 *
 * Rankings are stored and transmitted as **dense weak-order integers**: tied
 * items share the same integer, and the set of distinct ranks forms a
 * contiguous run 1..K (no gaps between tiers). For example `[A=1, B=2, C=2, D=3]`
 * means B and C are tied for the second tier.
 *
 * Settlement averages ranks across voters, so a tie must be scored with
 * **mid-rank** (the mean of the positions the tied items occupy) rather than
 * competition ranking. Mid-rank keeps every ballot's total rank mass equal to
 * N(N+1)/2, which makes the aggregation fair and non-exploitable: marking every
 * item as rank 1 simply yields the mean rank for all of them (equivalent to
 * abstaining), instead of unfairly boosting them.
 *
 * @see plan/GAS/updated_project_spec.md for the settlement design.
 */

/**
 * Convert a voter's dense weak-order ranks into mid-ranks.
 *
 * Items sharing a dense rank occupy a consecutive block of positions; each is
 * assigned the average of those positions. Strict (all-unique) rankings are
 * returned unchanged, so this is backward-compatible with existing data.
 *
 * @param rankings - Map of itemId → dense rank (positive integers, ties allowed)
 * @returns Map of itemId → mid-rank (may be fractional, e.g. 2.5)
 *
 * @example
 * // [A=1, B=2, C=2, D=3] → A=1, B=2.5, C=2.5, D=4
 * denseRanksToMidRanks({ A: 1, B: 2, C: 2, D: 3 })
 *
 * @example
 * // All five tied at rank 1 → every item becomes rank 3 (the mean of 1..5)
 * denseRanksToMidRanks({ a: 1, b: 1, c: 1, d: 1, e: 1 })
 */
export function denseRanksToMidRanks(
  rankings: Record<string, number>
): Record<string, number> {
  // Group item ids by their dense rank value.
  const itemsByRank = new Map<number, string[]>();
  for (const [itemId, rank] of Object.entries(rankings)) {
    const bucket = itemsByRank.get(rank);
    if (bucket) {
      bucket.push(itemId);
    } else {
      itemsByRank.set(rank, [itemId]);
    }
  }

  const result: Record<string, number> = {};
  let position = 0; // 0-based position cursor across all items

  // Walk tiers from best (lowest dense rank) to worst.
  const sortedRanks = Array.from(itemsByRank.keys()).sort((a, b) => a - b);
  for (const rank of sortedRanks) {
    const tiedItems = itemsByRank.get(rank)!;
    const tiedCount = tiedItems.length;

    // The tied items occupy 1-based positions (position+1) .. (position+tiedCount).
    let positionSum = 0;
    for (let k = 0; k < tiedCount; k++) {
      positionSum += position + k + 1;
    }
    const midRank = positionSum / tiedCount;

    for (const itemId of tiedItems) {
      result[itemId] = midRank;
    }
    position += tiedCount;
  }

  return result;
}

/**
 * Validate that a list of ranks forms a valid dense weak ordering.
 *
 * Rules: every rank is a positive integer, and the set of distinct ranks is
 * exactly the contiguous run 1..K (ties/repeats allowed, gaps between tiers are
 * not). This replaces the old "unique + contiguous" rule once ties are allowed.
 *
 * @param ranks - The rank values to validate
 * @returns true if the ranks form a valid weak ordering
 *
 * @example
 * validateWeakOrder([1, 2, 2, 3]) // true  (B/C tied for tier 2)
 * validateWeakOrder([1, 1, 1])    // true  (all tied for tier 1)
 * validateWeakOrder([1, 3])       // false (tier 2 is skipped)
 * validateWeakOrder([0, 1])       // false (rank must be ≥ 1)
 */
export function validateWeakOrder(ranks: number[]): boolean {
  if (ranks.length === 0) {
    return false;
  }

  for (const rank of ranks) {
    if (!Number.isInteger(rank) || rank < 1) {
      return false;
    }
  }

  // Distinct ranks must be exactly the contiguous run 1..K.
  const distinct = Array.from(new Set(ranks)).sort((a, b) => a - b);
  for (let i = 0; i < distinct.length; i++) {
    if (distinct[i] !== i + 1) {
      return false;
    }
  }

  return true;
}
