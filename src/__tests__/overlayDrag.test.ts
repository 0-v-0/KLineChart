import { describe, expect, it } from 'vitest'

import { constrainToAxis, DRAG_DRAW_MIN_PX, isDragBeyond, snapAcrossAxis, snapShapePoint, snapToAngles, snapToSquare } from '../extension/overlay/utils'

describe('isDragBeyond', () => {
  it('treats a press that never moved as a click', () => {
    expect(isDragBeyond({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(false)
  })

  it('needs the full distance, not just a pixel', () => {
    expect(isDragBeyond({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(false)
    expect(isDragBeyond({ x: 0, y: 0 }, { x: DRAG_DRAW_MIN_PX, y: 0 })).toBe(true)
  })

  it('measures the diagonal, so a short move on both axes still counts', () => {
    expect(isDragBeyond({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(true)
    expect(isDragBeyond({ x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false)
  })

  it('takes a threshold, for a caller that wants its own tolerance', () => {
    expect(isDragBeyond({ x: 0, y: 0 }, { x: 10, y: 0 }, 10)).toBe(true)
    expect(isDragBeyond({ x: 0, y: 0 }, { x: 9, y: 0 }, 10)).toBe(false)
  })
})

describe('constrainToAxis', () => {
  it('keeps the press height when the drag went further sideways', () => {
    expect(constrainToAxis({ x: 0, y: 0 }, { x: 10, y: 3 })).toEqual({ x: 10, y: 0 })
  })

  it('keeps the press column when the drag went further up or down', () => {
    expect(constrainToAxis({ x: 0, y: 0 }, { x: 3, y: 10 })).toEqual({ x: 0, y: 10 })
  })

  it('breaks an exact diagonal toward the horizontal', () => {
    expect(constrainToAxis({ x: 0, y: 0 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 0 })
  })

  it('measures from the press, not from the origin', () => {
    expect(constrainToAxis({ x: 100, y: 50 }, { x: 90, y: 80 })).toEqual({ x: 100, y: 80 })
  })
})

describe('snapToAngles', () => {
  it('flattens a nearly horizontal cursor onto the horizontal', () => {
    expect(snapToAngles({ x: 0, y: 0 }, { x: 10, y: 1 })).toEqual({ x: 10, y: 0 })
  })

  it('turns a nearly vertical cursor to the vertical', () => {
    const snapped = snapToAngles({ x: 0, y: 0 }, { x: 1, y: 10 })
    expect(snapped.x).toBeCloseTo(0, 10)
    expect(snapped.y).toBeCloseTo(10, 10)
  })

  it('drops a diagonal cursor onto the 45° ray', () => {
    const snapped = snapToAngles({ x: 0, y: 0 }, { x: 10, y: 9 })
    expect(snapped.x).toBeCloseTo(9.5, 10)
    expect(snapped.y).toBeCloseTo(9.5, 10)
  })

  it('keeps the sign of a ray pointing the other way', () => {
    const snapped = snapToAngles({ x: 0, y: 0 }, { x: 10, y: -9 })
    expect(snapped.x).toBeCloseTo(9.5, 10)
    expect(snapped.y).toBeCloseTo(-9.5, 10)
  })

  it('projects onto the ray rather than stretching out to the cursor', () => {
    const snapped = snapToAngles({ x: 0, y: 0 }, { x: 10, y: 5 })
    expect(Math.hypot(snapped.x, snapped.y)).toBeCloseTo(15 * Math.SQRT1_2, 10)
  })

  it('measures from the anchor, not from the origin', () => {
    expect(snapToAngles({ x: 100, y: 100 }, { x: 110, y: 101 })).toEqual({ x: 110, y: 100 })
  })
})

describe('snapToSquare', () => {
  it('gives both sides the longer distance', () => {
    expect(snapToSquare({ x: 0, y: 0 }, { x: 10, y: 3 })).toEqual({ x: 10, y: 10 })
    expect(snapToSquare({ x: 0, y: 0 }, { x: 2, y: 40 })).toEqual({ x: 40, y: 40 })
  })

  it('grows toward the quadrant the cursor is in', () => {
    expect(snapToSquare({ x: 0, y: 0 }, { x: -10, y: 3 })).toEqual({ x: -10, y: 10 })
    expect(snapToSquare({ x: 0, y: 0 }, { x: 3, y: -10 })).toEqual({ x: 10, y: -10 })
  })

  it('measures from the anchor, not from the origin', () => {
    expect(snapToSquare({ x: 50, y: 50 }, { x: 55, y: 51 })).toEqual({ x: 55, y: 55 })
  })
})

describe('snapAcrossAxis', () => {
  const flat = [
    { x: 0, y: 0 },
    { x: 100, y: 0 }
  ] as const
  const upright = [
    { x: 0, y: 0 },
    { x: 0, y: 100 }
  ] as const

  it('keeps the cursor column and puts it half the axis length above the axis', () => {
    expect(snapAcrossAxis(flat[0], flat[1], { x: 70, y: 20 })).toEqual({ x: 70, y: 50 })
  })

  it('keeps the side the cursor was on', () => {
    expect(snapAcrossAxis(flat[0], flat[1], { x: 70, y: -20 })).toEqual({ x: 70, y: -50 })
  })

  it('reads the axis the other way round when it is upright', () => {
    expect(snapAcrossAxis(upright[0], upright[1], { x: 20, y: 80 })).toEqual({ x: 50, y: 80 })
    expect(snapAcrossAxis(upright[0], upright[1], { x: -20, y: 80 })).toEqual({ x: -50, y: 80 })
  })

  it('follows a diagonal axis', () => {
    // Already on the perpendicular through the midpoint at exactly the short
    // radius, so the only thing left to check is that it does not move.
    const snapped = snapAcrossAxis({ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 })
    expect(snapped.x).toBeCloseTo(100, 10)
    expect(snapped.y).toBeCloseTo(0, 10)
  })

  it('puts a cursor sitting on the axis itself on the positive side', () => {
    const snapped = snapAcrossAxis({ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 150, y: 150 })
    expect(snapped.x).toBeCloseTo(100, 10)
    expect(snapped.y).toBeCloseTo(200, 10)
  })

  it('leaves the cursor alone when the axis has no length', () => {
    expect(snapAcrossAxis({ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 9, y: 9 })).toEqual({ x: 9, y: 9 })
  })
})

describe('snapShapePoint', () => {
  const ray = [
    { x: 0, y: 0 },
    { x: 100, y: 2 }
  ]

  it('lets a circle go where the cursor is, since it has no sides to keep', () => {
    expect(snapShapePoint('circle', ray, 1, { x: 40, y: 37 })).toEqual({ x: 40, y: 37 })
  })

  it('squares a box from the corner across it', () => {
    const box = [
      { x: 0, y: 0 },
      { x: 100, y: 50 }
    ]
    expect(snapShapePoint('rect', box, 1, { x: 60, y: 45 })).toEqual({ x: 60, y: 60 })
    expect(snapShapePoint('box', box, 1, { x: 60, y: 45 })).toEqual({ x: 60, y: 60 })
  })

  it('squares from the other corner when the first one is the handle', () => {
    const box = [
      { x: 100, y: 50 },
      { x: 0, y: 0 }
    ]
    expect(snapShapePoint('rect', box, 0, { x: 120, y: 45 })).toEqual({ x: 120, y: 120 })
  })

  it('sends a line down a ray from the point before it', () => {
    expect(snapShapePoint('segment', ray, 1, { x: 40, y: 3 })).toEqual({ x: 40, y: 0 })
  })

  it('reads the point before it, not the one being dragged', () => {
    const angle = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 }
    ]
    const snapped = snapShapePoint('triangle', angle, 2, { x: 52, y: 90 })
    expect(snapped.x).toBeCloseTo(50, 10)
    expect(snapped.y).toBeCloseTo(90, 10)
  })

  it('keeps an ellipse to its axis by its third point', () => {
    const ellipse = [
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    ]
    expect(snapShapePoint('ellipse', ellipse, 2, { x: 70, y: 20 })).toEqual({ x: 70, y: 50 })
    expect(snapShapePoint('rotatedRectangle', ellipse, 2, { x: 70, y: 20 })).toEqual({ x: 70, y: 50 })
  })

  it('treats an ellipse axis point like any other point', () => {
    expect(snapShapePoint('ellipse', ray, 1, { x: 40, y: 3 })).toEqual({ x: 40, y: 0 })
  })

  it('leaves the cursor alone when the point to snap around is not there yet', () => {
    expect(snapShapePoint('segment', [], 1, { x: 40, y: 37 })).toEqual({ x: 40, y: 37 })
    expect(snapShapePoint('segment', [null], 1, { x: 40, y: 37 })).toEqual({ x: 40, y: 37 })
    // The first point of a box has nothing across it while it is being drawn.
    expect(snapShapePoint('rect', [{ x: 0, y: 0 }], 0, { x: 40, y: 37 })).toEqual({ x: 40, y: 37 })
  })
})
