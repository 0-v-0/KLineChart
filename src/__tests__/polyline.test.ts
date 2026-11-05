import { describe, expect, it } from 'vitest'

import type { OverlayCreateFiguresCallbackParams } from '../component/Overlay'
import { multiPoint } from '../extension/overlay/polyline'

interface FakePoint {
  dataIndex?: number
  timestamp?: number
  value?: number
  x?: number
  y?: number
}

interface FakeOverlay {
  id: string
  paneId: string
  points: FakePoint[]
  extendData?: Record<string, unknown>
}

/** Points are laid out 10 px apart, so a vertex and its neighbour are easy to reason about. */
function chart(pixels: Array<{ x: number; y: number }>) {
  return { convertToPixel: () => pixels, convertFromPixel: () => [], getChartStore: () => ({}) }
}

function figureParams(overlay: FakeOverlay, coordinates: Array<{ x: number; y: number }>): OverlayCreateFiguresCallbackParams<unknown> {
  return {
    chart: chart([]),
    overlay,
    coordinates,
    bounding: { width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300 },
    xAxis: null,
    yAxis: null
  } as unknown as OverlayCreateFiguresCallbackParams<unknown>
}

describe('the polyline and the path', () => {
  it('drops the duplicate vertex a double-click leaves behind', () => {
    const overlay: FakeOverlay = {
      id: 'p1',
      paneId: 'candle_pane',
      points: [{ value: 1 }, { value: 2 }, { value: 2 }]
    }
    const template = multiPoint('polyline')()
    template.completeDrawing?.({
      overlay,
      chart: chart([
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 41, y: 1 }
      ])
    } as never)
    expect(overlay.points).toHaveLength(2)
  })

  it('closes a polyline finished back on its first vertex', () => {
    const overlay: FakeOverlay = {
      id: 'p2',
      paneId: 'candle_pane',
      points: [{ value: 1 }, { value: 2 }, { value: 3 }, { value: 1 }]
    }
    const template = multiPoint('polyline')()
    template.completeDrawing?.({
      overlay,
      chart: chart([
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
        { x: 6, y: 5 }
      ])
    } as never)
    expect(overlay.points).toHaveLength(3)
    expect(overlay.extendData).toEqual({ closed: true })
  })

  it('leaves a path open even when it ends where it started', () => {
    const overlay: FakeOverlay = {
      id: 'p3',
      paneId: 'candle_pane',
      points: [{ value: 1 }, { value: 2 }, { value: 3 }, { value: 1 }]
    }
    const template = multiPoint('path')()
    template.completeDrawing?.({
      overlay,
      chart: chart([
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
        { x: 6, y: 5 }
      ])
    } as never)
    expect(overlay.points).toHaveLength(4)
    expect(overlay.extendData?.closed).toBeUndefined()
  })

  it('fills a closed polyline and strokes an open one', () => {
    const coordinates = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 }
    ]
    const closed = multiPoint('polyline')().createPointFigures?.(figureParams({ id: 'a', paneId: 'candle_pane', points: [], extendData: { closed: true } }, coordinates)) as Array<{ type: string; styles: { style: string } }>
    expect(closed).toHaveLength(1)
    expect(closed[0].type).toBe('polygon')
    expect(closed[0].styles.style).toBe('stroke_fill')

    const open = multiPoint('polyline')().createPointFigures?.(figureParams({ id: 'a', paneId: 'candle_pane', points: [] }, coordinates)) as Array<{ type: string }>
    expect(open).toHaveLength(1)
    expect(open[0].type).toBe('line')
  })

  it('puts an arrow on the last vertex of a path', () => {
    const figures = multiPoint('path')().createPointFigures?.(
      figureParams({ id: 'a', paneId: 'candle_pane', points: [] }, [
        { x: 0, y: 0 },
        { x: 100, y: 0 }
      ])
    ) as Array<{ type: string; key: string }>
    const keys = figures.map((figure) => figure.key)
    expect(keys).toContain('line')
    expect(keys).toContain('head_end')
  })
})
