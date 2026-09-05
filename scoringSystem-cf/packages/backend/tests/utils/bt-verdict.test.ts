/**
 * Tests for the Bradley-Terry pairwise verdict parser, and for the ranking
 * damage a fabricated verdict causes.
 *
 * Every AI ranking mode embeds participant-written content in the prompt, so
 * the model's output has to be treated as untrusted. In BT mode the model
 * answers 'A' or 'B' per pair, which cannot name an invented item — but the
 * parser used to coerce *anything it could not read* to 'A'. A truncated,
 * rate-limited or deliberately derailed response therefore handed item A a win
 * it never earned, and there was no way to tell those wins apart from real ones.
 */

import { describe, it, expect } from 'vitest'
import { parseBTVerdict } from '../../src/queues/ai-ranking-consumer'
import { computeBTRanking, type BTComparison } from '../../src/utils/bradley-terry'

describe('parseBTVerdict', () => {
  it('reads a well-formed verdict', () => {
    expect(parseBTVerdict('{"winner":"B","reason":"更有條理"}'))
      .toEqual({ winner: 'B', reason: '更有條理' })
  })

  it('accepts either side', () => {
    expect(parseBTVerdict('{"winner":"A","reason":"x"}').winner).toBe('A')
    expect(parseBTVerdict('{"winner":"B","reason":"x"}').winner).toBe('B')
  })

  it('extracts a verdict the model wrapped in prose', () => {
    const wrapped = 'Here is my answer:\n{"winner": "B", "reason": "better"}\nHope that helps.'
    expect(parseBTVerdict(wrapped).winner).toBe('B')
  })

  it('returns null rather than guessing when there is no verdict', () => {
    for (const content of [
      '',
      'I cannot decide between these two.',
      '{"winner":"C","reason":"neither"}',
      '{"reason":"no winner field"}',
      '{"winner":null}',
      '{ truncated json',
      '{"winner":"AB"}'
    ]) {
      expect(parseBTVerdict(content).winner, `input: ${JSON.stringify(content)}`).toBeNull()
    }
  })

  it('never returns a non-string reason', () => {
    expect(parseBTVerdict('{"winner":"A","reason":{"nested":1}}').reason).toBe('')
    expect(parseBTVerdict('{"winner":"A"}').reason).toBe('')
  })
})

describe('what a fabricated verdict does to the ranking', () => {
  const itemIds = ['x', 'y']

  const compare = (winner: string | undefined): BTComparison[] => [
    { itemA: 'x', itemB: 'y', winner, reason: 'r' } as BTComparison
  ]

  it('a recorded win moves that item ahead', () => {
    expect(computeBTRanking(compare('y'), itemIds).ranking[0]).toBe('y')
    expect(computeBTRanking(compare('x'), itemIds).ranking[0]).toBe('x')
  })

  it('an unrecorded comparison is skipped, not counted for either side', () => {
    // This is what the fix makes possible: the pair simply does not vote.
    const skipped = computeBTRanking(compare(undefined), itemIds)
    const strengths = Object.values(skipped.strengthParams)
    expect(new Set(strengths).size, 'no item should have gained an advantage').toBe(1)
  })

  it('the old coerce-to-A behaviour would have handed x the win', () => {
    // Documents the defect precisely: unreadable content used to become 'A',
    // and 'A' is whichever item happened to occupy the first slot of the pair.
    const oldBehaviourWinner = 'A' // what parseBTVerdict used to return
    const asRecorded = oldBehaviourWinner === 'A' ? 'x' : 'y'
    expect(computeBTRanking(compare(asRecorded), itemIds).ranking[0]).toBe('x')

    // The parser now refuses to produce that verdict.
    expect(parseBTVerdict('I cannot decide.').winner).toBeNull()
  })
})
