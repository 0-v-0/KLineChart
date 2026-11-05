import { describe, expect, it } from 'vitest'

import { arrowMarkerOutline } from '../extension/overlay/arrowMarker'

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y)

describe('the arrow marker outline', () => {
  it('runs from the tail to the tip', () => {
    const outline = arrowMarkerOutline({ x: 0, y: 0 }, { x: 100, y: 0 })
    // First and fourth points are the tail and the tip.
    expect(outline[0]).toEqual({ x: 0, y: 0 })
    expect(outline[3].x).toBeCloseTo(100)
    expect(outline[3].y).toBeCloseTo(0)
  })

  it('draws a short arrow at 22 px, measured back from the tip', () => {
    const outline = arrowMarkerOutline({ x: 90, y: 0 }, { x: 100, y: 0 })
    expect(distance(outline[0], { x: 100, y: 0 })).toBeCloseTo(22)
  })

  it('never lets the head swallow the body on a long arrow', () => {
    const outline = arrowMarkerOutline({ x: 0, y: 0 }, { x: 1000, y: 0 })
    // Head length 106: the widest point sits 106 px back from the tip.
    const widest = outline.reduce((a, b) => (Math.abs(a.y) >= Math.abs(b.y) ? a : b))
    expect(1000 - widest.x).toBeCloseTo(106)
  })

  it('has nothing to draw when both points are the same', () => {
    expect(arrowMarkerOutline({ x: 10, y: 10 }, { x: 10, y: 10 })).toEqual([])
  })
})
