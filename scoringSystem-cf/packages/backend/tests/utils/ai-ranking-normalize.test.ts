/**
 * Tests for normalizeAIRanking, and for the scoring damage it prevents.
 *
 * Submission and comment text is inserted into the AI prompt verbatim
 * (`buildUserPrompt`), so a participant can write anything they like into the
 * model's input — including a fake `ID:` block or an instruction to list their
 * own item twice. The consumer already dropped invented ids and back-filled
 * omissions, but it did not deduplicate, and the consensus stage scores by list
 * position. A repeat therefore scored one item twice.
 */

import { describe, it, expect } from 'vitest'
import { normalizeAIRanking } from '../../src/utils/ai-provider'
import { computeFreeMadRanking } from '../../src/utils/free-mad'

describe('normalizeAIRanking', () => {
  const items = ['a', 'b', 'c']

  it('keeps a well-formed ranking untouched', () => {
    expect(normalizeAIRanking(['b', 'a', 'c'], items)).toEqual(['b', 'a', 'c'])
  })

  it('drops ids the model invented', () => {
    expect(normalizeAIRanking(['b', 'ghost', 'a', 'c'], items)).toEqual(['b', 'a', 'c'])
  })

  it('collapses duplicates, keeping the first position', () => {
    expect(normalizeAIRanking(['a', 'a', 'b', 'c'], items)).toEqual(['a', 'b', 'c'])
    expect(normalizeAIRanking(['b', 'a', 'b', 'c'], items)).toEqual(['b', 'a', 'c'])
  })

  it('back-fills items the model omitted, in the order they were sent', () => {
    expect(normalizeAIRanking(['c'], items)).toEqual(['c', 'a', 'b'])
    expect(normalizeAIRanking([], items)).toEqual(['a', 'b', 'c'])
  })

  it('always returns each item exactly once', () => {
    for (const raw of [
      ['a', 'a', 'a'],
      ['ghost', 'ghost'],
      ['c', 'b', 'a', 'c', 'b', 'a'],
      []
    ]) {
      const out = normalizeAIRanking(raw, items)
      expect(out.slice().sort(), `input ${JSON.stringify(raw)}`).toEqual(['a', 'b', 'c'])
      expect(new Set(out).size).toBe(items.length)
    }
  })

  it('handles an empty item list without inventing anything', () => {
    expect(normalizeAIRanking(['a'], [])).toEqual([])
  })
})

describe('the Borda corruption a duplicate used to cause', () => {
  const itemIds = ['a', 'b', 'c']

  /** Score one round-1 ranking through the real consensus function. */
  const score = (ranking: string[]) =>
    computeFreeMadRanking(
      [{ providerId: 'p1', providerName: 'P1', ranking, reason: '' }],
      [],
      itemIds
    )

  it('awards Borda points by list position', () => {
    // Three items, W_INITIAL = 20: first place (3-0)*20, then 40, then 20.
    expect(score(['a', 'b', 'c']).scores).toEqual({ a: 60, b: 40, c: 20 })
  })

  it('a repeated id collects points twice — what the old code fed in', () => {
    // The previous consumer filtered invalid ids and back-filled omissions but
    // never deduplicated, so this array reached the scorer as-is.
    const corrupted = score(['b', 'b', 'a', 'c'])

    // 'b' scores at position 0 (60) *and* position 1 (40) = 100, instead of the
    // 60 it should get for coming first. Everything else is pushed down a slot.
    expect(corrupted.scores).toEqual({ b: 100, a: 20, c: 0 })
    expect(corrupted.scores!.b).toBeGreaterThan(score(['b', 'a', 'c']).scores!.b)
  })

  it('normalizeAIRanking makes the duplicated input score identically to the clean one', () => {
    const viaNormalize = score(normalizeAIRanking(['b', 'b', 'a', 'c'], itemIds))
    const clean = score(['b', 'a', 'c'])

    expect(viaNormalize.ranking).toEqual(clean.ranking)
    expect(viaNormalize.scores).toEqual(clean.scores)
    expect(viaNormalize.scores).toEqual({ b: 60, a: 40, c: 20 })
  })
})
