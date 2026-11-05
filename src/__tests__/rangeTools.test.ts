import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { OverlayCreateFiguresCallbackParams } from '../component/Overlay'
import { rangeTool, type RangeKind } from '../extension/overlay/rangeTools'

beforeAll(() => {
  // Node has no canvas; text measurement only needs a width.
  vi.stubGlobal('document', {
    createElement: () => ({
      ownerDocument: { defaultView: { devicePixelRatio: 1 } },
      getContext: () => ({ scale: () => undefined, measureText: (text: string) => ({ width: text.length * 6 }) })
    })
  })
})

afterAll(() => {
  vi.unstubAllGlobals()
})

interface Point {
  dataIndex?: number
  timestamp?: number
  value?: number
}

function params(kind: RangeKind, p0: Point, p1: Point, extendData: Record<string, unknown> = {}): OverlayCreateFiguresCallbackParams<unknown> {
  const data = [
    { timestamp: 0, open: 1, high: 1, low: 1, close: 1, volume: 200 },
    { timestamp: 60_000, open: 1, high: 1, low: 1, close: 1, volume: 300 }
  ]
  const chart = {
    getChartStore: () => ({
      getSymbol: () => ({ pricePrecision: 2 }),
      timestampToDataIndex: (timestamp: number) => (timestamp === 0 ? 0 : 1)
    }),
    getDataList: () => data
  }
  return {
    chart,
    overlay: { id: `${kind}-1`, points: [p0, p1], extendData },
    coordinates: [
      { x: 100, y: 100 },
      { x: 200, y: 200 }
    ],
    bounding: { width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300 },
    xAxis: null,
    yAxis: null
  } as unknown as OverlayCreateFiguresCallbackParams<unknown>
}

function labelText(kind: RangeKind, p0: Point, p1: Point, extendData: Record<string, unknown> = {}): string {
  const figures = rangeTool(kind)().createPointFigures?.(params(kind, p0, p1, extendData)) as Array<{ key: string; attrs: { text: string } }>
  return figures.find((figure) => figure.key === 'label')?.attrs.text ?? ''
}

describe('the range tools', () => {
  it('reads the price move with its percentage and tick count', () => {
    const text = labelText('price', { value: 100, dataIndex: 0 }, { value: 110, dataIndex: 1 })
    // Two decimals: +10.00 on 100 is 10.00%, which is 1000 ticks at 0.01.
    expect(text).toBe('10.00 (10.00%) 1,000')
  })

  it('counts the bars and the time a date range spans, with their volume', () => {
    const text = labelText('date', { value: 1, dataIndex: 0, timestamp: 0 }, { value: 1, dataIndex: 1, timestamp: 60_000 })
    expect(text).toBe('1 bars, 1m\nVol 500')
  })

  it('carries both lines on the combined tool', () => {
    const text = labelText('dateAndPrice', { value: 100, dataIndex: 0, timestamp: 0 }, { value: 110, dataIndex: 1, timestamp: 60_000 })
    expect(text.split('\n')).toEqual(['10.00 (10.00%) 1,000', '1 bars, 1m', 'Vol 500'])
  })

  it('runs the arrow the drag direction, with a head past a minimum length', () => {
    const figures = rangeTool('price')().createPointFigures?.(params('price', { value: 100 }, { value: 110 })) as Array<{ key: string }>
    const keys = figures.map((figure) => figure.key)
    // Downward drag: the arrow runs top to bottom and gets its chevron.
    expect(keys).toContain('arrow_price')
    expect(keys).toContain('arrow_price_head')
    // No horizontal arrow on a price range.
    expect(keys).not.toContain('arrow_date')
  })

  it('breaks the arrow around its own text, so the label is not crossed out', () => {
    const figures = rangeTool('date')().createPointFigures?.(params('date', { value: 1, dataIndex: 0 }, { value: 1, dataIndex: 1 }, { customTextVisible: true, text: 'breakout' })) as Array<{ key: string; attrs: { coordinates: unknown[] } }>
    const pieces = figures.filter((figure) => figure.key === 'arrow_date' || figure.key === 'arrow_date_1')
    // The label sits in the middle of the arrow, so the line is drawn as two pieces.
    expect(pieces.length).toBe(2)
    expect(figures.some((figure) => figure.key === 'custom_text')).toBe(true)
  })
})
