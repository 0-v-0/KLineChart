import { describe, expect, it } from 'vitest'
import type Point from '../common/Point'
import type { Overlay } from '../component/Overlay'
import { boxHandles } from '../extension/overlay/extraHandles'

/**
 * `boxHandles` is what a box tool hands the view so it can draw handles where
 * no point sits. The view numbers them on after the points and calls
 * `moveExtraHandle` with `index - points.length`, so the indices here are the
 * contract: 0 and 1 are the opposite corners, 2..5 the edge midpoints.
 */

/** Two points: the box's opposite corners, at (10, 10) and (30, 50). */
function box(): Array<Partial<Point>> {
  return [
    { timestamp: 1000, dataIndex: 10, value: 10 },
    { timestamp: 5000, dataIndex: 30, value: 50 }
  ]
}

const coordinates = [
  { x: 10, y: 10 },
  { x: 30, y: 50 }
]

/** `boxHandles` reads only `overlay.points`, so the rest of the instance is left out. */
const fakeOverlay = (points: Array<Partial<Point>>): Overlay => ({ points }) as unknown as Overlay

describe('boxHandles', () => {
  it('puts the two other corners opposite the points it was given', () => {
    expect(boxHandles(false).createExtraHandles?.({ overlay: fakeOverlay(box()), coordinates })).toEqual([
      { x: 10, y: 50 },
      { x: 30, y: 10 }
    ])
  })

  it('adds an edge midpoint either side when the box wants edges', () => {
    expect(boxHandles(true).createExtraHandles?.({ overlay: fakeOverlay(box()), coordinates })).toEqual([
      { x: 10, y: 50 },
      { x: 30, y: 10 },
      { x: 20, y: 10, square: true },
      { x: 30, y: 30, square: true },
      { x: 20, y: 50, square: true },
      { x: 10, y: 30, square: true }
    ])
  })

  it('draws no handle until there are two corners', () => {
    expect(boxHandles(true).createExtraHandles?.({ overlay: fakeOverlay([{ value: 1 }]), coordinates: [{ x: 1, y: 1 }] })).toEqual([])
  })

  it('points the resize arrows along the diagonals, flipping with the box', () => {
    const cursor = boxHandles(true).handleCursor
    const at = (index: number, coords = coordinates): string | undefined => cursor?.({ overlay: fakeOverlay(box()), coordinates: coords, index })
    // (10,10) to (30,50) runs top-left to bottom-right, so the two corners on
    // that diagonal get the north-west arrow and the other two its mirror.
    expect(at(0)).toBe('nwse-resize')
    expect(at(1)).toBe('nwse-resize')
    expect(at(2)).toBe('nesw-resize')
    expect(at(3)).toBe('nesw-resize')
    // Edges: even indices move vertically, odd horizontally.
    expect(at(4)).toBe('ns-resize')
    expect(at(5)).toBe('ew-resize')
    expect(at(6)).toBe('ns-resize')
    expect(at(7)).toBe('ew-resize')
    // The same box mirrored: (30,10) to (10,50) runs the other diagonal.
    expect(
      at(0, [
        { x: 30, y: 10 },
        { x: 10, y: 50 }
      ])
    ).toBe('nesw-resize')
    expect(
      at(2, [
        { x: 30, y: 10 },
        { x: 10, y: 50 }
      ])
    ).toBe('nwse-resize')
    expect(at(0, [{ x: 1, y: 1 }])).toBeUndefined()
  })

  it('moves only the field each handle owns', () => {
    const dragged = { dataIndex: 40, timestamp: 9000, value: 90 }
    const cases: Array<[number, Partial<Point>, Partial<Point>]> = [
      // A far corner takes its time from the drag and its price from the point
      // it is opposite, so the box grows along one edge only.
      [0, { timestamp: 9000, dataIndex: 40, value: 10 }, { timestamp: 5000, dataIndex: 30, value: 90 }],
      [1, { timestamp: 1000, dataIndex: 10, value: 90 }, { timestamp: 9000, dataIndex: 40, value: 50 }],
      // Edge midpoints move a single field of a single point.
      [2, { timestamp: 1000, dataIndex: 10, value: 90 }, { timestamp: 5000, dataIndex: 30, value: 50 }],
      [3, { timestamp: 1000, dataIndex: 10, value: 10 }, { timestamp: 9000, dataIndex: 40, value: 50 }],
      [4, { timestamp: 1000, dataIndex: 10, value: 10 }, { timestamp: 5000, dataIndex: 30, value: 90 }],
      [5, { timestamp: 9000, dataIndex: 40, value: 10 }, { timestamp: 5000, dataIndex: 30, value: 50 }]
    ]
    for (const [index, first, second] of cases) {
      const points = box()
      boxHandles(true).moveExtraHandle?.({
        overlay: fakeOverlay(points),
        index,
        coordinate: { x: dragged.dataIndex, y: dragged.value },
        coordinates,
        toPoint: () => ({ ...dragged })
      })
      expect({ index, points }).toEqual({ index, points: [first, second] })
    }
  })
})
