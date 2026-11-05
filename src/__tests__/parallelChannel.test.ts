import { describe, expect, it } from 'vitest'

import type { OverlayCreateFiguresCallbackParams } from '../component/Overlay'
import parallelChannel from '../extension/overlay/parallelChannel'

interface FakeOverlay {
  id: string
  points: Array<{ dataIndex?: number; timestamp?: number; value?: number }>
  extendData?: Record<string, unknown>
}

function params(overlay: FakeOverlay, coordinates: Array<{ x: number; y: number }>): OverlayCreateFiguresCallbackParams<unknown> {
  return {
    chart: {},
    overlay,
    coordinates,
    bounding: { width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300 },
    xAxis: null,
    yAxis: null
  } as unknown as OverlayCreateFiguresCallbackParams<unknown>
}

const lines = [
  { x: 100, y: 100 },
  { x: 200, y: 120 },
  { x: 150, y: 160 }
]

describe('the parallel channel', () => {
  it('runs the second line parallel to the base, off by the third point', () => {
    const figures = parallelChannel().createPointFigures?.(params({ id: 'c', points: [], extendData: {} }, lines)) as Array<{ key: string; attrs: { coordinates: Array<{ x: number; y: number }> } }>
    const base = figures.find((figure) => figure.key === 'line_0')?.attrs.coordinates ?? []
    const parallel = figures.find((figure) => figure.key === 'line_1')?.attrs.coordinates ?? []
    // The base at x 150 is y 110, so the third point sits 50 below it.
    expect(base).toEqual([
      { x: 100, y: 100 },
      { x: 200, y: 120 }
    ])
    expect(parallel).toEqual([
      { x: 100, y: 150 },
      { x: 200, y: 170 }
    ])
  })

  it('draws the background and the midline unless they are switched off', () => {
    const keys = (extendData: Record<string, unknown>): string[] => (parallelChannel().createPointFigures?.(params({ id: 'c', points: [], extendData }, lines)) as Array<{ key: string }>).map((figure) => figure.key)
    expect(keys({})).toEqual(['background', 'midline', 'line_0', 'line_1', 'text'])
    expect(keys({ showBackground: false, showMidline: false })).toEqual(['line_0', 'line_1', 'text'])
  })

  it('is only its base line until the third click', () => {
    const figures = parallelChannel().createPointFigures?.(params({ id: 'c', points: [], extendData: {} }, lines.slice(0, 2))) as Array<{ key: string }>
    expect(figures.map((figure) => figure.key)).toEqual(['line_0'])
  })

  it('offers the parallel ends and the base midpoint as handles', () => {
    const handles = parallelChannel().createExtraHandles?.({ coordinates: lines, overlay: { id: 'c', points: [] } } as never) as Array<{ x: number; y: number }>
    expect(handles).toEqual([
      { x: 100, y: 150 },
      { x: 200, y: 170 },
      { x: 150, y: 110 }
    ])
  })

  it('keeps the channel width when an end handle is dragged', () => {
    const overlay = {
      id: 'c',
      points: [{ value: 110 }, { value: 90 }, { value: 60 }]
    }
    parallelChannel().moveExtraHandle?.({
      overlay,
      index: 0,
      coordinate: { x: 80, y: 120 },
      coordinates: lines,
      // Pixels to a value: y grows as the value falls, so the identity is enough here.
      toPoint: (coordinate: { x: number; y: number }) => ({ value: coordinate.y })
    } as never)
    // The base end lands at y 120 on a handle that holds the width: it goes
    // where the handle is, 50 above it. Point 2 rides along on the new base
    // line, still 50 below it.
    expect(overlay.points[0].value).toBe(70)
    const baseAtC = 70 + ((120 - 70) * (150 - 80)) / (200 - 80)
    expect(overlay.points[2].value).toBeCloseTo(baseAtC + 50)
  })
})
