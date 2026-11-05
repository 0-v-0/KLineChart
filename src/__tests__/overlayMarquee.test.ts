import { describe, expect, it } from 'vitest'

import { segmentIntersectsRect } from '../extension/overlay/utils'

// The marquee is the rect (0, 0) – (10, 10) throughout.
const LEFT = 0
const TOP = 0
const RIGHT = 10
const BOTTOM = 10

function crosses(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  return segmentIntersectsRect(from, to, LEFT, TOP, RIGHT, BOTTOM)
}

describe('segmentIntersectsRect', () => {
  it('takes a segment with both ends inside', () => {
    expect(crosses({ x: 2, y: 2 }, { x: 8, y: 8 })).toBe(true)
  })

  it('takes a segment with one end inside', () => {
    expect(crosses({ x: 5, y: 5 }, { x: 50, y: 5 })).toBe(true)
  })

  it('takes a horizontal line straight through', () => {
    expect(crosses({ x: -5, y: 5 }, { x: 15, y: 5 })).toBe(true)
  })

  it('takes a vertical line straight through', () => {
    expect(crosses({ x: 5, y: -5 }, { x: 5, y: 15 })).toBe(true)
  })

  it('takes a diagonal through two opposite sides', () => {
    expect(crosses({ x: -5, y: -5 }, { x: 15, y: 15 })).toBe(true)
  })

  it('rejects a segment entirely on one side', () => {
    expect(crosses({ x: -5, y: 2 }, { x: -5, y: 8 })).toBe(false)
    expect(crosses({ x: 2, y: 20 }, { x: 8, y: 25 })).toBe(false)
  })

  it('rejects a segment that passes the corner it is aimed at, and misses', () => {
    // Crosses the left edge at y = 12.5 and the top edge left of the rect: it
    // goes over the corner without touching it.
    expect(crosses({ x: -5, y: 5 }, { x: 5, y: 20 })).toBe(false)
    expect(crosses({ x: 15, y: 5 }, { x: 5, y: -10 })).toBe(false)
  })

  it('counts a segment that only grazes the edge', () => {
    expect(crosses({ x: -5, y: 0 }, { x: 15, y: 0 })).toBe(true)
    expect(crosses({ x: 0, y: -5 }, { x: 0, y: 15 })).toBe(true)
  })

  it('counts a segment ending on a corner', () => {
    expect(crosses({ x: -5, y: 15 }, { x: 0, y: 10 })).toBe(true)
  })

  it('treats a segment with no length as the point it is', () => {
    expect(crosses({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(true)
    expect(crosses({ x: 50, y: 5 }, { x: 50, y: 5 })).toBe(false)
  })
})
