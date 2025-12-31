/**
 * @fileoverview Free-MAD (Consensus-Free Multi-Agent Debate) Algorithm Implementation
 * Based on: https://arxiv.org/html/2509.11035v1
 *
 * This implementation tracks position changes across debate rounds and uses
 * weighted scoring to aggregate rankings from multiple LLM providers.
 */

import type {
  MultiAgentRound1Result,
  MultiAgentRound2Result,
  MultiAgentDebateDetail,
  MultiAgentFinalResult
} from '@repo/shared';

// ============================================
// Types
// ============================================

/**
 * Free-MAD scoring weights configuration
 */
export interface FreeMadWeights {
  /** Initial Borda score weight for Round 1 */
  W_INITIAL: number;
  /** Bonus for persisting with original ranking in Round 2 */
  W_PERSIST: number;
  /** Penalty for changing position in Round 2 */
  W_CHANGE: number;
  /** Bonus when other agents adopt your ranking */
  W_ADOPTED: number;
}

/**
 * Default Free-MAD weights
 */
export const DEFAULT_FREE_MAD_WEIGHTS: FreeMadWeights = {
  W_INITIAL: 20,   // Round 1 Borda base score
  W_PERSIST: 25,   // Bonus for persisting
  W_CHANGE: 30,    // Penalty for changing
  W_ADOPTED: 20    // Bonus for being adopted
};

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate Kendall tau distance between two rankings
 * Returns a value between 0 (completely different) and 1 (identical)
 *
 * @param rankingA - First ranking array
 * @param rankingB - Second ranking array
 * @returns Similarity score between 0 and 1
 */
export function calculateRankingSimilarity(rankingA: string[], rankingB: string[]): number {
  if (rankingA.length === 0 || rankingB.length === 0) return 0;
  if (rankingA.length !== rankingB.length) {
    // Handle different lengths by using the intersection
    const setA = new Set(rankingA);
    const setB = new Set(rankingB);
    const common = rankingA.filter(id => setB.has(id));
    if (common.length < 2) return 0;

    // Create sub-rankings with only common items
    rankingA = rankingA.filter(id => setB.has(id));
    rankingB = rankingB.filter(id => setA.has(id));
  }

  const n = rankingA.length;
  if (n < 2) return 1; // Single item or empty, consider identical

  // Create position maps
  const posA: Record<string, number> = {};
  const posB: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    posA[rankingA[i]] = i;
    posB[rankingB[i]] = i;
  }

  // Count concordant and discordant pairs
  let concordant = 0;
  let discordant = 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const itemI = rankingA[i];
      const itemJ = rankingA[j];

      // In ranking A, itemI comes before itemJ (i < j)
      // Check if the same is true in ranking B
      const posI_B = posB[itemI];
      const posJ_B = posB[itemJ];

      if (posI_B !== undefined && posJ_B !== undefined) {
        if (posI_B < posJ_B) {
          concordant++;
        } else {
          discordant++;
        }
      }
    }
  }

  const totalPairs = concordant + discordant;
  if (totalPairs === 0) return 1;

  // Kendall tau: (concordant - discordant) / total_pairs
  // Normalized to [0, 1]: (tau + 1) / 2
  const tau = (concordant - discordant) / totalPairs;
  return (tau + 1) / 2;
}

/**
 * Check if two rankings are identical
 *
 * @param rankingA - First ranking array
 * @param rankingB - Second ranking array
 * @returns True if rankings are identical
 */
export function areRankingsIdentical(rankingA: string[], rankingB: string[]): boolean {
  if (rankingA.length !== rankingB.length) return false;
  return rankingA.every((id, index) => id === rankingB[index]);
}

/**
 * Calculate Borda count score for a ranking
 * First place gets n-1 points, last place gets 0 points
 *
 * @param ranking - Ranking array (best to worst)
 * @returns Record of item ID to score
 */
export function calculateBordaScores(ranking: string[]): Record<string, number> {
  const scores: Record<string, number> = {};
  const n = ranking.length;

  for (let i = 0; i < n; i++) {
    scores[ranking[i]] = n - 1 - i;
  }

  return scores;
}

// ============================================
// Core Free-MAD Algorithm
// ============================================

/**
 * Compute the final ranking using Free-MAD weighted aggregation
 *
 * The algorithm:
 * 1. Each item gets initial Borda scores from Round 1 rankings
 * 2. If a provider persists with their ranking in Round 2, their items get bonus points
 * 3. If a provider changes, their original ranking items get penalized
 * 4. If other providers adopt a ranking, the original ranking gets bonus points
 *
 * @param round1Results - Results from Round 1 (independent rankings)
 * @param round2Results - Results from Round 2 (after debate)
 * @param itemIds - All item IDs being ranked
 * @param weights - Scoring weights (optional, uses defaults)
 * @returns Final ranking result with scores and debate details
 */
export function computeFreeMadRanking(
  round1Results: MultiAgentRound1Result[],
  round2Results: MultiAgentRound2Result[],
  itemIds: string[],
  weights: FreeMadWeights = DEFAULT_FREE_MAD_WEIGHTS
): MultiAgentFinalResult {
  const scores: Record<string, number> = {};

  // Initialize scores
  for (const id of itemIds) {
    scores[id] = 0;
  }

  const n = itemIds.length;
  const providerCount = round1Results.length;

  // === Step 1: Round 1 Borda base scores ===
  for (const r1 of round1Results) {
    for (let i = 0; i < r1.ranking.length; i++) {
      const itemId = r1.ranking[i];
      if (scores[itemId] !== undefined) {
        // Borda score: higher rank = more points
        const bordaScore = (n - i) * weights.W_INITIAL;
        scores[itemId] += bordaScore;
      }
    }
  }

  // === Step 2: Round 2 position tracking ===
  for (const r2 of round2Results) {
    const r1 = round1Results.find(r => r.providerId === r2.providerId);
    if (!r1) continue;

    if (!r2.changed) {
      // Provider persisted with original ranking: bonus
      for (let i = 0; i < r2.ranking.length; i++) {
        const itemId = r2.ranking[i];
        if (scores[itemId] !== undefined) {
          // Higher ranked items get more persistence bonus
          const persistBonus = weights.W_PERSIST * ((n - i) / n);
          scores[itemId] += persistBonus;
        }
      }
    } else {
      // Provider changed position: penalty to original ranking
      for (let i = 0; i < r1.ranking.length; i++) {
        const itemId = r1.ranking[i];
        if (scores[itemId] !== undefined) {
          // Penalty distributed across items
          const changePenalty = weights.W_CHANGE / n;
          scores[itemId] -= changePenalty;
        }
      }

      // New ranking gets partial credit
      for (let i = 0; i < r2.ranking.length; i++) {
        const itemId = r2.ranking[i];
        if (scores[itemId] !== undefined) {
          // Half the initial weight for changed positions
          const newScore = (n - i) * weights.W_INITIAL * 0.5;
          scores[itemId] += newScore;
        }
      }
    }
  }

  // === Step 3: Adoption bonus ===
  // Check if any provider's Round 2 ranking matches another's Round 1 ranking
  for (const r1 of round1Results) {
    let adoptionCount = 0;

    for (const r2 of round2Results) {
      if (r2.providerId === r1.providerId) continue;
      if (!r2.changed) continue; // Only check changed rankings

      // Check similarity between r1's ranking and r2's new ranking
      const similarity = calculateRankingSimilarity(r1.ranking, r2.ranking);
      if (similarity > 0.8) {
        adoptionCount++;
      }
    }

    // Award adoption bonus
    if (adoptionCount > 0) {
      for (let i = 0; i < r1.ranking.length; i++) {
        const itemId = r1.ranking[i];
        if (scores[itemId] !== undefined) {
          const adoptionBonus = weights.W_ADOPTED * adoptionCount * ((n - i) / n);
          scores[itemId] += adoptionBonus;
        }
      }
    }
  }

  // === Step 4: Generate final ranking ===
  const sortedItems = [...itemIds].sort((a, b) => scores[b] - scores[a]);

  // === Step 5: Build debate details ===
  const debateDetails: MultiAgentDebateDetail[] = round1Results.map(r1 => {
    const r2 = round2Results.find(r => r.providerId === r1.providerId);
    return {
      providerId: r1.providerId,
      providerName: r1.providerName,
      round1Ranking: r1.ranking,
      round1Reason: r1.reason,
      round2Ranking: r2?.ranking || r1.ranking,
      round2Reason: r2?.reason || r1.reason,
      changed: r2?.changed || false,
      critique: r2?.critique
    };
  });

  // === Step 6: Generate combined reason ===
  const persistedProviders = round2Results.filter(r => !r.changed).map(r => r.providerName);
  const changedProviders = round2Results.filter(r => r.changed).map(r => r.providerName);

  let reason = `經過 ${providerCount} 個 AI 的兩輪辯論：`;
  if (persistedProviders.length > 0) {
    reason += `${persistedProviders.join('、')} 堅持原本立場；`;
  }
  if (changedProviders.length > 0) {
    reason += `${changedProviders.join('、')} 調整了排名；`;
  }
  reason += `依據 Free-MAD 權重計算出最終排名。`;

  return {
    ranking: sortedItems,
    reason,
    scores,
    debateDetails
  };
}

// ============================================
// Prompt Generation
// ============================================

/**
 * Generate Round 2 prompt for a provider to review other rankings
 *
 * @param myRound1Result - This provider's Round 1 result
 * @param otherRound1Results - Other providers' Round 1 results
 * @param rankingType - 'submission' or 'comment'
 * @returns System and user prompts for Round 2
 */
export function generateRound2Prompt(
  myRound1Result: MultiAgentRound1Result,
  otherRound1Results: MultiAgentRound1Result[],
  rankingType: 'submission' | 'comment'
): { systemPrompt: string; userPrompt: string } {
  const itemType = rankingType === 'submission' ? '成果' : '評論';

  const systemPrompt = `你是一個教育評分助手。你已經對${itemType}進行了初步排名，現在請審視其他評審的排名。

**重要指示：**
- 仔細檢視其他評審的排名和理由
- 找出他們可能的問題或錯誤
- **只有當你確認自己的排名有明確錯誤時，才改變立場**
- **不要因為多數人選擇某個排名就從眾**
- 保持獨立思考，堅持你認為正確的判斷

請以 JSON 格式回覆：
{
  "ranking": ["id1", "id2", ...],  // 你的最終排名（從最好到最差）
  "changed": true/false,           // 是否改變了排名
  "reason": "你的判斷理由（200字內）",
  "critique": "對其他排名的評論（100字內，可選）"
}`;

  let userPrompt = `你的初始排名是：
${myRound1Result.ranking.map((id, i) => `${i + 1}. ${id}`).join('\n')}

你的理由：${myRound1Result.reason}

---

其他評審的排名：
`;

  for (const other of otherRound1Results) {
    userPrompt += `
【${other.providerName}】
排名：${other.ranking.map((id, i) => `${i + 1}. ${id}`).join('、')}
理由：${other.reason}
`;
  }

  userPrompt += `
---

請仔細審視上述排名，給出你的最終判斷。`;

  return { systemPrompt, userPrompt };
}

/**
 * Parse Round 2 response from AI
 *
 * @param responseText - Raw response text from AI
 * @param providerId - Provider ID
 * @param providerName - Provider display name
 * @param originalRanking - Original Round 1 ranking (fallback)
 * @returns Parsed Round 2 result
 */
export function parseRound2Response(
  responseText: string,
  providerId: string,
  providerName: string,
  originalRanking: string[]
): MultiAgentRound2Result {
  try {
    // Try to extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      providerId,
      providerName,
      ranking: Array.isArray(parsed.ranking) ? parsed.ranking : originalRanking,
      reason: typeof parsed.reason === 'string' ? parsed.reason : '無理由說明',
      changed: typeof parsed.changed === 'boolean' ? parsed.changed : false,
      critique: typeof parsed.critique === 'string' ? parsed.critique : undefined
    };
  } catch (error) {
    // If parsing fails, assume no change
    return {
      providerId,
      providerName,
      ranking: originalRanking,
      reason: '解析回應失敗，保持原排名',
      changed: false
    };
  }
}
