import { describe, expect, it } from 'vitest'

import { constrainToAxis, DRAG_DRAW_MIN_PX, isDragBeyond } from '../extension/overlay/utils'

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
