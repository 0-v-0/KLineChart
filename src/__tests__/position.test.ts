import { describe, expect, it } from 'vitest'

import { positionExit, positionFill, positionStats } from '../extension/overlay/position'

describe("the position tool's money maths", () => {
  it('sizes the trade from the account and the risk percent', () => {
    const stats = positionStats(100, 90, 130, {})
    // 25% of 1000 is 250 of risk over a stop 10 away: 25 units, in lots of 1.
    expect(stats.riskAmount).toBe(250)
    expect(stats.qty).toBe(25)
    expect(stats.lots).toBe(25)
    expect(stats.reward).toBe(750)
    expect(stats.ratio).toBe(3)
    expect(stats.targetAmount).toBe(1750)
    expect(stats.stopAmount).toBe(750)
  })

  it('rounds the lots down, as TV does', () => {
    const stats = positionStats(100, 90, 130, { lotSize: 2 })
    expect(stats.qty).toBe(25)
    expect(stats.lots).toBe(12)
  })

  it('takes a money risk and clamps it to the account', () => {
    expect(positionStats(100, 90, 130, { riskMode: 'money', risk: 50 }).riskAmount).toBe(50)
    expect(positionStats(100, 90, 130, { riskMode: 'money', risk: 5000 }).riskAmount).toBe(1000)
  })

  it('clamps a percent risk at the whole account', () => {
    expect(positionStats(100, 90, 130, { risk: 150 }).riskAmount).toBe(1000)
  })

  it('has no size when the stop sits on the entry', () => {
    const stats = positionStats(100, 100, 130, {})
    expect(stats.qty).toBe(0)
    expect(stats.ratio).toBe(0)
  })
})

const bars = [
  { high: 105, low: 95 },
  { high: 112, low: 98 },
  { high: 135, low: 110 }
]

describe('when a position fills and closes', () => {
  it('fills on the first bar that reaches the entry', () => {
    expect(positionFill(bars, 0, 2, 100)).toBe(0)
    expect(positionFill(bars, 0, 2, 108)).toBe(1)
  })

  it('stays pending while no bar reaches the entry', () => {
    expect(positionFill(bars, 0, 2, 200)).toBeNull()
    // An entry past the last bar has no bar to fill on.
    expect(positionFill(bars, 5, 9, 100)).toBeNull()
  })

  it('closes at the target when a later bar reaches it', () => {
    expect(positionExit(bars, 0, 2, 'long', 90, 130)).toEqual({ price: 130, hit: 'target' })
  })

  it('closes at the stop, and treats a bar that reaches both as the stop', () => {
    const entryBar = { high: 105, low: 95 }
    expect(positionExit([entryBar, { high: 100, low: 85 }], 0, 1, 'long', 90, 130)).toEqual({ price: 90, hit: 'stop' })
    // One bar, both levels: the bars cannot say which came first.
    expect(positionExit([entryBar, { high: 140, low: 80 }], 0, 1, 'long', 90, 130)).toEqual({ price: 90, hit: 'stop' })
  })

  it('mirrors the levels on a short', () => {
    // A short wins when a bar falls to the target and loses when one rises to
    // the stop; this bar only falls.
    expect(
      positionExit(
        [
          { high: 112, low: 105 },
          { high: 112, low: 98 }
        ],
        0,
        1,
        'short',
        120,
        100
      )
    ).toEqual({ price: 100, hit: 'target' })
  })

  it('skips a bar with no data and stops at the right edge', () => {
    const sparse = [{ high: 105, low: 95 }, undefined, { high: 140, low: 100 }]
    expect(positionExit(sparse, 0, 1, 'long', 90, 130)).toBeNull()
    expect(positionExit(sparse, 0, 2, 'long', 90, 130)).toEqual({ price: 130, hit: 'target' })
  })
})
