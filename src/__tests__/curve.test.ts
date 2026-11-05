import { describe, expect, it } from 'vitest'

import type { OverlayCreateFiguresCallbackParams } from '../component/Overlay'
import curve, { curveCoordinates } from '../extension/overlay/curve'

interface FakePoint {
  dataIndex?: number
  timestamp?: number
  value?: number
  x?: number
  y?: number
}

describe('the curve', () => {
  it('passes through the handle between its ends', () => {
    const line = curveCoordinates({ x: 0, y: 100 }, { x: 200, y: 100 }, { x: 100, y: 0 })
    expect(line[0]).toEqual({ x: 0, y: 100 })
    expect(line[line.length - 1]).toEqual({ x: 200, y: 100 })
    // The middle sample is the handle itself: the curve is bowed, not straight.
    const middle = line[Math.floor(line.length / 2)]
    expect(middle.x).toBeCloseTo(100, 0)
    expect(middle.y).toBeCloseTo(0, 0)
  })

  it('is straight when the handle sits on the chord', () => {
    const line = curveCoordinates({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 })
    expect(line.every((point) => Math.abs(point.y) < 1e-9)).toBe(true)
  })

  it('bows a new curve, adding the handle two clicks in', () => {
    const points: FakePoint[] = [{ value: 10 }, { value: 20 }]
    const overlay = { id: 'c1', paneId: 'candle_pane', points, extendData: {} }
    const chart = {
      convertToPixel: () => [
        { x: 0, y: 100 },
        { x: 200, y: 100 }
      ],
      convertFromPixel: (coordinates: Array<{ x: number; y: number }>) => coordinates.map((coordinate) => ({ dataIndex: 0, timestamp: 0, value: coordinate.y }))
    }
    curve().completeDrawing?.({ overlay, chart } as never)
    expect(points).toHaveLength(3)
    // Bow pushed perpendicular to the chord; on a horizontal chord that is a y offset.
    expect(points[2].value).toBeCloseTo(100 + 200 * 0.15)
  })

  it('draws a straight line until the third point exists', () => {
    const params = {
      chart: {},
      overlay: { id: 'c1', points: [{ value: 1 }, { value: 2 }], extendData: {} },
      coordinates: [
        { x: 0, y: 0 },
        { x: 100, y: 50 }
      ],
      bounding: { width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300 },
      xAxis: null,
      yAxis: null
    } as unknown as OverlayCreateFiguresCallbackParams<unknown>
    const figures = curve().createPointFigures?.(params) as Array<{ key: string; attrs: { coordinates: Array<{ x: number; y: number }> } }>
    const line = figures.find((figure) => figure.key === 'curve')
    expect(line?.attrs.coordinates).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 50 }
    ])
  })
})
